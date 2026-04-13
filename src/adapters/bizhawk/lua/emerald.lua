-- BizHawk Lua bridge for Pokemon Emerald (GBA)
-- Emits newline-delimited JSON to localhost TCP.
-- Memory-domain based only (no screen analysis).

local socket = nil
local ok_socket, socket_module = pcall(require, 'socket')
if ok_socket and socket_module then
  socket = socket_module
else
  local ok_core, socket_core = pcall(require, 'socket.core')
  if ok_core and socket_core then
    socket = socket_core
  end
end

if not socket or type(socket.tcp) ~= 'function' then
  print('[bizhawk-emerald] ERROR: LuaSocket missing (socket/socket.core).')
  return
end

local HOST = '127.0.0.1'
local PORT = 17374
local SEND_INTERVAL_FRAMES = 1

-- Address rules:
-- - EWRAM addresses below are DOMAIN-RELATIVE offsets.
-- - System Bus addresses are full bus addresses.
local ADDR = {
  inBattleFlag = { domain = 'EWRAM', addr = 0x22FEC }, -- TODO verify
  menuFlag = { domain = 'EWRAM', addr = 0x22F90 }, -- TODO verify
  loadingFlag = { domain = 'System Bus', addr = 0x03000F9C }, -- TODO verify
  battleTypeFlags = { domain = 'EWRAM', addr = 0x22FBC }, -- TODO verify

  enemyMonBase = { domain = 'EWRAM', addr = 0x2402C }, -- TODO verify
  enemySpeciesOffset = 0x20, -- TODO verify
  enemyLevelOffset = 0x54, -- TODO verify
  enemyHpOffset = 0x56, -- TODO verify
  enemyMaxHpOffset = 0x58, -- TODO verify
  enemyPidOffset = 0x00,
}

local client = nil
local connected = false
local last_connect_attempt = 0
local last_send_timeout_frame = -1
local warned_missing_domains = {}
local warned_reads = {}

local function json_escape(str)
  str = tostring(str)
  str = str:gsub('\\', '\\\\')
  str = str:gsub('"', '\\"')
  str = str:gsub('\n', '\\n')
  str = str:gsub('\r', '\\r')
  str = str:gsub('\t', '\\t')
  return str
end

local function json_encode(value)
  local t = type(value)
  if t == 'nil' then
    return 'null'
  elseif t == 'boolean' then
    return value and 'true' or 'false'
  elseif t == 'number' then
    return tostring(value)
  elseif t == 'string' then
    return '"' .. json_escape(value) .. '"'
  elseif t == 'table' then
    local is_array = true
    local max_index = 0

    for k, _ in pairs(value) do
      if type(k) ~= 'number' then
        is_array = false
        break
      end
      if k > max_index then
        max_index = k
      end
    end

    local parts = {}
    if is_array then
      for i = 1, max_index do
        parts[#parts + 1] = json_encode(value[i])
      end
      return '[' .. table.concat(parts, ',') .. ']'
    end

    for k, v in pairs(value) do
      parts[#parts + 1] = '"' .. json_escape(k) .. '":' .. json_encode(v)
    end
    return '{' .. table.concat(parts, ',') .. '}'
  end

  return 'null'
end

local function get_domain_alias(preferred)
  local ok, domains = pcall(memory.getmemorydomainlist)
  if not ok or type(domains) ~= 'table' then
    return nil
  end

  local set = {}
  for _, d in ipairs(domains) do
    set[d] = true
  end

  if set[preferred] then
    return preferred
  end

  if preferred == 'EWRAM' then
    if set['WRAM'] then return 'WRAM' end
    if set['Combined WRAM'] then return 'Combined WRAM' end
    if set['System Bus'] then return 'System Bus' end
  end

  if preferred == 'IWRAM' then
    if set['IRAM'] then return 'IRAM' end
    if set['Combined WRAM'] then return 'Combined WRAM' end
    if set['System Bus'] then return 'System Bus' end
  end

  return nil
end

local function safe_use_domain(domain)
  local resolved = get_domain_alias(domain)
  if not resolved then
    if not warned_missing_domains[domain] then
      warned_missing_domains[domain] = true
      local ok, domains = pcall(memory.getmemorydomainlist)
      local domain_str = ok and table.concat(domains, ', ') or 'unavailable'
      print('[bizhawk-emerald] missing memory domain: ' .. tostring(domain))
      print('[bizhawk-emerald] available domains: ' .. domain_str)
    end
    return false
  end

  local ok, err = pcall(memory.usememorydomain, resolved)
  if not ok then
    if not warned_missing_domains[resolved] then
      warned_missing_domains[resolved] = true
      print('[bizhawk-emerald] memory domain error: ' .. tostring(resolved) .. ' / ' .. tostring(err))
    end
    return false
  end

  return true
end

local function safe_read(kind, domain, addr)
  if not safe_use_domain(domain) then
    return nil
  end

  local ok, value
  if kind == 'u8' then
    ok, value = pcall(memory.read_u8, addr)
  elseif kind == 'u16' then
    ok, value = pcall(memory.read_u16_le, addr)
  elseif kind == 'u32' then
    ok, value = pcall(memory.read_u32_le, addr)
  else
    return nil
  end

  if not ok then
    local key = domain .. ':' .. string.format('0x%X', addr)
    if not warned_reads[key] then
      warned_reads[key] = true
      print('[bizhawk-emerald] read failed at ' .. key)
    end
    return nil
  end

  return value
end

local function read_enemy_value(offset, size)
  local base = ADDR.enemyMonBase
  local addr = base.addr + offset
  if size == 1 then
    return safe_read('u8', base.domain, addr)
  elseif size == 2 then
    return safe_read('u16', base.domain, addr)
  end
  return safe_read('u32', base.domain, addr)
end

local function is_trainer_battle(type_flags)
  if type_flags == nil then
    return nil
  end

  local TRAINER_BATTLE_BIT = 0x0008 -- TODO verify
  return (type_flags & TRAINER_BATTLE_BIT) ~= 0
end

local function compute_shiny_from_pid(pid)
  if pid == nil then
    return nil
  end

  -- TODO: use TID/SID formula when IDs are wired
  return nil
end

local function reconnect_if_needed()
  if connected and client then
    return
  end

  local now = os.time()
  if now == last_connect_attempt then
    return
  end
  last_connect_attempt = now

  if client then
    pcall(function() client:close() end)
    client = nil
  end

  client = socket.tcp()
  if not client then
    return
  end
  client:settimeout(0)
  local ok, err = client:connect(HOST, PORT)
  if ok == 1 or err == 'already connected' or err == 'Operation already in progress' or err == 'timeout' then
    connected = true
    print('[bizhawk-emerald] connected to app bridge ' .. HOST .. ':' .. PORT)
    return
  end

  connected = false
end

local function send_json_line(payload)
  if not connected or not client then
    return
  end

  local encoded = json_encode(payload)
  local ok, err = client:send(encoded .. '\n')
  if not ok and err == 'timeout' then
    -- Non-blocking socket backpressure; keep connection alive.
    local frame = emu.framecount()
    if frame ~= last_send_timeout_frame then
      last_send_timeout_frame = frame
      print('[bizhawk-emerald] socket send timeout; dropping one frame payload')
    end
    return
  end

  if not ok then
    connected = false
    print('[bizhawk-emerald] socket send failed: ' .. tostring(err))
    pcall(function() client:close() end)
    client = nil
  end
end

local function detect_state()
  local in_battle_raw = safe_read('u8', ADDR.inBattleFlag.domain, ADDR.inBattleFlag.addr)
  local menu_raw = safe_read('u8', ADDR.menuFlag.domain, ADDR.menuFlag.addr)
  local loading_raw = safe_read('u8', ADDR.loadingFlag.domain, ADDR.loadingFlag.addr)
  local battle_type_flags = safe_read('u32', ADDR.battleTypeFlags.domain, ADDR.battleTypeFlags.addr)

  local pid = read_enemy_value(ADDR.enemyPidOffset, 4)
  local species_id = read_enemy_value(ADDR.enemySpeciesOffset, 2)
  local level = read_enemy_value(ADDR.enemyLevelOffset, 1)
  local hp = read_enemy_value(ADDR.enemyHpOffset, 2)
  local max_hp = read_enemy_value(ADDR.enemyMaxHpOffset, 2)

  local in_battle = nil
  if in_battle_raw ~= nil then
    in_battle = in_battle_raw ~= 0
  end

  local menu_open = nil
  if menu_raw ~= nil then
    menu_open = menu_raw ~= 0
  end

  local loading = nil
  if loading_raw ~= nil then
    loading = loading_raw ~= 0
  end

  return {
    version = 1,
    source = 'bizhawk-lua',
    game = 'Pokemon Emerald',
    platform = 'gba',
    connected = true,
    frame = emu.framecount(),
    timestamp = os.time() * 1000,
    flags = {
      inBattle = in_battle,
      menuOpen = menu_open,
      loading = loading
    },
    battle = {
      typeFlags = battle_type_flags,
      isTrainerBattle = is_trainer_battle(battle_type_flags)
    },
    encounter = {
      speciesId = species_id,
      level = level,
      hp = hp,
      maxHp = max_hp,
      pid = pid,
      shiny = compute_shiny_from_pid(pid)
    },
    addressMeta = {
      inBattleFlag = 'EWRAM:0x22FEC',
      menuFlag = 'EWRAM:0x22F90',
      loadingFlag = 'System Bus:0x03000F9C',
      battleTypeFlags = 'EWRAM:0x22FBC',
      enemyMonBase = 'EWRAM:0x2402C'
    }
  }
end

print('[bizhawk-emerald] script loaded. Waiting for connection on ' .. HOST .. ':' .. PORT)

while true do
  reconnect_if_needed()

  if emu.framecount() % SEND_INTERVAL_FRAMES == 0 then
    local payload = detect_state()
    send_json_line(payload)
  end

  emu.frameadvance()
end