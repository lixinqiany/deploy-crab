/** MongoDB 任务脚本；安装过程只在用户从 Session 提交后执行。 */
const python = (body: string) =>
  `set -euo pipefail\npython3 - <<'PY'\n${body}\nPY`;
const common = String.raw`
import json, os, re, socket, subprocess, sys, tempfile, time
from pathlib import Path
p = json.loads(os.environ['DEPLOY_CRAB_INPUT'])
c = json.loads(os.environ.get('DEPLOY_CRAB_CONTEXT', '{}'))
def log(message): print(message, file=sys.stderr, flush=True)
def command(args): subprocess.run(args, check=True, stdout=sys.stderr)
def fail(message): raise SystemExit(message)
def topology():
    members = p['members']
    if not isinstance(members, list) or not 1 <= len(members) <= 7: fail('请配置 1–7 个数据节点；一般使用 1 或 3 个节点')
    ids, addresses = set(), set()
    for m in members:
        if m['hostId'] in ids: fail('成员主机重复')
        ids.add(m['hostId'])
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9.-]{0,252}', m['hostname']): fail('成员地址请填写可解析的 DNS 主机名，不能直接使用 IP')
        if not isinstance(m['port'], int) or isinstance(m['port'], bool) or not 1 <= m['port'] <= 65535: fail('MongoDB 端口必须在 1–65535 之间')
        address = m['hostname'] + ':' + str(m['port'])
        if address in addresses: fail('成员地址重复')
        addresses.add(address)
    targets = {t['id'] for t in c.get('targets', [])}
    if targets and ids != targets: fail('成员表必须与本次选择的执行目标完全一致')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,50}', p['replicaSetName']): fail('复制集名称只能使用字母、数字、下划线和短横线，以字母开头')
    return members

def current():
    members = topology()
    host_id = c.get('target', {}).get('id')
    for member in members:
        if member['hostId'] == host_id: return member
    fail('当前主机没有对应的成员配置')

def environment():
    if os.geteuid() != 0: fail('此任务需要通过 root SSH 登录')
    release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    release = {key: value.strip('"') for key, value in release.items()}
    version = p['mongoVersion']
    supported = {'8.0': ['20.04', '22.04', '24.04'], '9.0': ['22.04', '24.04', '26.04']}
    if release.get('ID') != 'ubuntu' or release.get('VERSION_ID') not in supported.get(version, []):
        fail('MongoDB ' + version + ' 不支持当前系统 ' + release.get('PRETTY_NAME', '未知系统'))
    arch = subprocess.check_output(['dpkg', '--print-architecture'], text=True).strip()
    if arch not in ['amd64', 'arm64']: fail('仅支持 amd64 和 arm64')
    if not Path('/run/systemd/system').exists(): fail('需要使用 systemd 的 Ubuntu 主机')
    return release, arch

def run_js(source):
    member = current()
    fd, filename = tempfile.mkstemp(prefix='deploy-crab-mongo-', suffix='.js')
    try:
        with os.fdopen(fd, 'w') as file: file.write(source)
        result = subprocess.run(['mongosh', '--quiet', '--norc', '--host', '127.0.0.1', '--port', str(member['port']), '--file', filename], capture_output=True, text=True)
        if result.stderr: log(result.stderr)
        if result.returncode: fail('mongosh 执行失败，退出码 ' + str(result.returncode))
        return json.loads(result.stdout)
    finally: os.unlink(filename)
`;
const jsCommon = String.raw`
const p = JSON.parse(process.env.DEPLOY_CRAB_INPUT);
const admin = db.getSiblingDB('admin');
const members = p.members.map((m, i) => ({_id: i, host: m.hostname + ':' + m.port}));
let authenticated = false;
try { authenticated = !!admin.auth(p.adminUser, p.adminPassword); } catch (_) {}
const pause = () => sleep(1000);
`;

export const mongoPreflight = python(
  common +
    String.raw`
release, arch = environment()
member = current()
for m in topology():
    socket.getaddrinfo(m['hostname'], m['port'], type=socket.SOCK_STREAM)
manifest = Path('/etc/deploy-crab/mongodb.json')
expected = {'replicaSetName': p['replicaSetName'], 'mongoVersion': p['mongoVersion'], 'members': p['members']}
if manifest.exists():
    if json.loads(manifest.read_text()) != expected: fail('已有部署与本次配置不同；请使用独立的升级或成员变更流程')
else:
    installed = subprocess.run(['dpkg-query', '-W', '-f=' + chr(36) + '{Status}', 'mongodb-org-server'], capture_output=True, text=True)
    data = Path('/var/lib/mongodb')
    if 'install ok installed' in installed.stdout or (data.exists() and any(data.iterdir())):
        fail('检测到未由此任务管理的 MongoDB 或数据，停止自动部署')
log('环境检查通过：Ubuntu ' + release['VERSION_ID'] + ' / MongoDB ' + p['mongoVersion'] + ' / ' + member['hostname'])
if release['VERSION_ID'] == '26.04': log('Ubuntu 26.04 要求 MongoDB 9.0.4 或更新的 9.0 版本')
`,
);

export const mongoRepository = python(
  common +
    String.raw`
release, arch = environment()
version = p['mongoVersion']
key_version = '9' if version == '9.0' else '8.0'
key_path = '/usr/share/keyrings/mongodb-server-' + key_version + '.gpg'
command(['apt-get', 'update'])
command(['apt-get', 'install', '-y', 'ca-certificates', 'curl', 'gnupg'])
fd, temporary = tempfile.mkstemp(prefix='mongo-key-')
os.close(fd)
try:
    command(['curl', '--fail', '--silent', '--show-error', '--location', 'https://pgp.mongodb.com/server-' + key_version + '.asc', '-o', temporary])
    command(['gpg', '--batch', '--yes', '--dearmor', '-o', key_path, temporary])
    os.chmod(key_path, 0o644)
finally: os.unlink(temporary)
source = 'deb [ arch=' + arch + ' signed-by=' + key_path + ' ] https://repo.mongodb.org/apt/ubuntu ' + release['VERSION_CODENAME'] + '/mongodb-org/' + version + ' multiverse\n'
Path('/etc/apt/sources.list.d/deploy-crab-mongodb.list').write_text(source)
command(['apt-get', 'update'])
log('MongoDB ' + version + ' 软件源已配置')
`,
);

export const mongoPrepare = python(
  common +
    String.raw`
import pwd
release, arch = environment()
member = current()
key = p['clusterKey']
if not re.fullmatch(r'[A-Za-z0-9+/=]{6,1024}', key): fail('复制集密钥必须是 6–1024 字符的 base64 文本；可使用平台自动生成的凭据')
manifest = Path('/etc/deploy-crab/mongodb.json')
expected = {'replicaSetName': p['replicaSetName'], 'mongoVersion': p['mongoVersion'], 'members': p['members']}
if manifest.exists() and json.loads(manifest.read_text()) != expected: fail('已有部署配置不一致，停止')
key_path = Path('/etc/mongodb-keyfile')
if key_path.exists() and key_path.read_text().strip() != key: fail('已有 keyfile 不同，不能通过部署任务轮换密钥')
if not manifest.exists():
    # 安装前记录管理意图，失败重试可继续；此标记不代表部署成功。
    manifest.parent.mkdir(mode=0o755, exist_ok=True)
    manifest.write_text(json.dumps(expected))
installed = subprocess.run(['dpkg-query', '-W', '-f=' + chr(36) + '{Version}', 'mongodb-org-server'], capture_output=True, text=True)
if installed.returncode == 0 and installed.stdout.strip():
    if not installed.stdout.strip().startswith(p['mongoVersion'] + '.'): fail('检测到不同主版本，禁止自动升级或降级')
else: command(['apt-get', 'install', '-y', 'mongodb-org'])
version = subprocess.check_output(['dpkg-query', '-W', '-f=' + chr(36) + '{Version}', 'mongodb-org-server'], text=True).strip()
if release['VERSION_ID'] == '26.04' and subprocess.run(['dpkg', '--compare-versions', version, 'ge', '9.0.4']).returncode != 0: fail('Ubuntu 26.04 至少需要 MongoDB 9.0.4')
command(['apt-mark', 'hold', 'mongodb-org', 'mongodb-org-database', 'mongodb-org-server', 'mongodb-org-mongos', 'mongodb-org-tools'])
user = pwd.getpwnam('mongodb')
fd = os.open(str(key_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o400)
with os.fdopen(fd, 'w') as file: file.write(key + '\n')
os.chown(key_path, user.pw_uid, user.pw_gid)
os.chmod(key_path, 0o400)
# JSON 是 YAML 的合法子集，避免手工拼接 YAML 参数。
config = {'storage': {'dbPath': '/var/lib/mongodb'}, 'systemLog': {'destination': 'file', 'logAppend': True, 'path': '/var/log/mongodb/mongod.log'}, 'net': {'port': member['port'], 'bindIp': '127.0.0.1,' + member['hostname']}, 'replication': {'replSetName': p['replicaSetName']}, 'security': {'keyFile': str(key_path), 'authorization': 'enabled'}, 'processManagement': {'timeZoneInfo': '/usr/share/zoneinfo'}}
config_path = Path('/etc/mongod.conf')
text = json.dumps(config, indent=2) + '\n'
changed = not config_path.exists() or config_path.read_text() != text
if changed:
    if config_path.exists() and not Path('/etc/mongod.conf.before-deploy-crab').exists(): Path('/etc/mongod.conf.before-deploy-crab').write_text(config_path.read_text())
    temporary = Path('/etc/mongod.conf.deploy-crab.tmp')
    temporary.write_text(text)
    os.chmod(temporary, 0o644)
    os.replace(temporary, config_path)
command(['systemctl', 'enable', 'mongod'])
command(['systemctl', 'restart' if changed else 'start', 'mongod'])
for attempt in range(60):
    try:
        with socket.create_connection(('127.0.0.1', member['port']), timeout=2): break
    except OSError:
        if attempt == 59: fail('mongod 启动超时，请检查服务日志')
        time.sleep(1)
log('节点已启动，版本 ' + version)
`,
);

export const mongoConnectivity = python(
  common +
    String.raw`
for member in topology():
    with socket.create_connection((member['hostname'], member['port']), timeout=5): pass
log('当前节点可访问所有 MongoDB 成员')
`,
);

export const mongoInitialize = python(
  common +
    '\nresult = run_js(' +
    JSON.stringify(
      jsCommon +
        String.raw`
let configured;
try {
  // 首次部署的 localhost exception 允许 rs.status()，不允许 rs.conf()。
  const status = rs.status();
  configured = {_id: status.set, members: status.members.map(m => ({host: m.name}))};
}
catch (error) {
  if (error.code !== 94 && error.codeName !== 'NotYetInitialized') throw error;
  const response = rs.initiate({_id: p.replicaSetName, members});
  if (response.ok !== 1) throw new Error('复制集初始化失败');
  configured = {_id: p.replicaSetName, members};
}
const actual = configured.members.map(m => m.host).sort();
const expected = members.map(m => m.host).sort();
if (configured._id !== p.replicaSetName || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('已有复制集与本次配置不同，拒绝隐式 reconfig');
let primary;
for (let attempt = 0; attempt < 90; attempt++) {
  primary = db.hello().primary;
  if (primary) break;
  pause();
}
const member = p.members.find(m => m.hostname + ':' + m.port === primary);
if (!member) throw new Error('未能在本次成员中识别 Primary');
print(JSON.stringify({primaryHostId: member.hostId, primary, replicaSetName: p.replicaSetName}));
`,
    ) +
    ')\nprint(json.dumps(result))',
);

export const mongoUsers = python(
  common +
    '\nresult = run_js(' +
    JSON.stringify(
      jsCommon +
        String.raw`
if (!db.hello().isWritablePrimary) throw new Error('Primary 已变化，请重新检查复制集后重试');
if (!authenticated) {
  const result = admin.runCommand({createUser: p.adminUser, pwd: p.adminPassword, roles: [{role: 'userAdminAnyDatabase', db: 'admin'}, {role: 'clusterAdmin', db: 'admin'}], writeConcern: {w: 'majority', wtimeout: 30000}});
  if (result.ok !== 1) throw new Error('创建管理用户失败；已有用户不会被自动覆盖');
  if (!admin.auth(p.adminUser, p.adminPassword)) throw new Error('管理用户认证失败');
}
print(JSON.stringify({authenticated: true, user: p.adminUser}));
`,
    ) +
    ')\nlog("管理用户认证通过")\nprint(json.dumps(result))',
);

export const mongoPrimary = python(
  common +
    '\nresult = run_js(' +
    JSON.stringify(
      jsCommon +
        String.raw`
let primary;
for (let attempt = 0; attempt < 90; attempt++) {
  primary = db.hello().primary;
  if (primary) break;
  pause();
}
const member = p.members.find(m => m.hostname + ':' + m.port === primary);
if (!member) throw new Error('没有在本次成员中找到 Primary');
print(JSON.stringify({primaryHostId: member.hostId, primary}));
`,
    ) +
    ')\nprint(json.dumps(result))',
);

export const mongoVerify = python(
  common +
    '\nresult = run_js(' +
    JSON.stringify(
      jsCommon +
        String.raw`
if (!authenticated) throw new Error('管理用户认证失败');
let status;
for (let attempt = 0; attempt < 90; attempt++) {
  status = rs.status();
  if (status.set === p.replicaSetName && status.members.length === members.length && status.members.every(m => m.health === 1 && [1, 2].includes(m.state))) break;
  if (attempt === 89) throw new Error('复制集成员未全部进入 PRIMARY / SECONDARY');
  pause();
}
print(JSON.stringify({replicaSetName: status.set, members: status.members.map(m => ({address: m.name, state: m.stateStr})), connectionString: 'mongodb://' + members.map(m => m.host).join(',') + '/?replicaSet=' + encodeURIComponent(p.replicaSetName) + '&authSource=admin'}));
`,
    ) +
    ')\nprint(json.dumps(result))',
);
