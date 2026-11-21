export interface AuthStatus {
  authenticated: boolean
  username?: string
  needsSetup: boolean
  mockMode: boolean
}

export interface HostInfo {
  hostname: string
  os: string
  kernel: string
  arch: string
  cpuModel: string
  cpuCores: number
  uptimeSec: number
  bootTime: string
  timezone: string
  ipAddresses: string[]
  mockMode: boolean
}

export interface MemoryMetrics {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPercent: number
}

export interface DiskMetrics {
  mountPoint: string
  device: string
  fsType: string
  totalBytes: number
  usedBytes: number
  usedPercent: number
}

export interface DiskIOMetrics {
  readBytesPerSec: number
  writeBytesPerSec: number
  readIops: number
  writeIops: number
}

export interface NetworkMetrics {
  interface: string
  rxBytesPerSec: number
  txBytesPerSec: number
  rxTotalBytes: number
  txTotalBytes: number
  isUp: boolean
}

export interface SystemAlert {
  id: string
  level: 'info' | 'warning' | 'critical'
  source: string
  message: string
}

export interface WorkloadSummary {
  failedUnits?: string[]
  failedContainers?: {id:string;name:string}[]
  servicesTotal: number
  servicesActive: number
  servicesInactive: number
  servicesFailed: number
  containersTotal: number
  containersRunning: number
  containersStopped: number
  containersError: number
}

export interface MetricsSnapshot {
  timestamp: string
  cpuUsagePercent: number
  cpuTempC?: number
  load1: number
  load5: number
  load15: number
  procsRunning: number
  procsTotal: number
  uptimeSec: number
  memory: MemoryMetrics
  swap: MemoryMetrics
  disks: DiskMetrics[]
  diskIO: DiskIOMetrics
  networks: NetworkMetrics[]
  alerts: SystemAlert[]
  workloads: WorkloadSummary
}

export interface HistoryPoint {
  timestamp: string
  cpu: number
  load1: number
  memPercent: number
  memUsedGB: number
  swapPercent: number
  diskReadMBs: number
  diskWriteMBs: number
  netRxKBs: number
  netTxKBs: number
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

export interface ServiceUnit {
  name: string
  description: string
  loadState: string
  activeState: string
  subState: string
  unitFileState: string
  mainPID: number
  memoryBytes: number
  isCritical: boolean
}

export interface ServiceDetail extends ServiceUnit {
  execStart: string
  fragmentPath: string
  activeEnterAt: string
  unitContent?: string
}

export interface CreateServiceRequest {
  name: string
  description?: string
  execStart?: string
  workingDirectory?: string
  user?: string
  restart?: string
  environment?: string
  after?: string
  unitContent?: string
  enable: boolean
  start: boolean
}

export type ContainerAction = 'start' | 'stop' | 'restart'

export interface ContainerPort {
  privatePort: number
  publicPort?: number
  type: string
  ip?: string
}

export interface ContainerSummary {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  status: string
  createdAt: string
  composeProject?: string
  composeService?: string
  ports: ContainerPort[]
  networks: string[]
  mounts: ContainerMount[]
  cpuPercent: number
  memoryBytes: number
  memoryLimitBytes: number
  isCritical: boolean
}

export interface ContainerMount {
  type: string
  source: string
  destination: string
  mode: string
  rw: boolean
}

export interface ContainerDetail extends ContainerSummary {
  command: string
  mounts: ContainerMount[]
  networks: string[]
  envKeys: string[]
  restartPolicy: string
}

export interface LogLine {
  timestamp: string
  stream: string
  message: string
}

export interface AuditEntry {
  timestamp: string
  user: string
  remoteIp: string
  action: string
  target: string
  status: string
  detail?: string
}

export interface ProcessInfo {
  pid: number
  name: string
  user: string
  state: string
  cpuPercent: number
  memPercent: number
  memBytes: number
  command: string
}

export interface CreateContainerPayload {
  name: string
  image: string
  ports: string[]
  volumes: string[]
  env: string[]
  restartPolicy: string
  autoStart: boolean
}

export interface ComposeDeployPayload {
  project: string
  workDir?: string
  yaml: string
}

export interface BarkSettings {
  enabled: boolean
  serverUrl: string
  deviceKey: string
  group: string
  notifyAlert: boolean
  notifyLogin: boolean
}

export interface PanelSettings {
  cpuAlertPercent: number
  memAlertPercent: number
  diskAlertPercent: number
  refreshIntervalSec: number
  defaultLogTail: number
  bark: BarkSettings
}

export interface RuntimeInfo {
  version: string
  commit: string
  buildTime: string
  addr: string
  dataDir: string
  dockerSocket: string
  mockMode: boolean
  goVersion: string
  os: string
  arch: string
}

export interface SettingsPayload {
  settings: PanelSettings
  runtime: RuntimeInfo
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mode: string
  modTime: string
}

export interface FileListResponse {
  path: string
  parent: string
  items: FileEntry[]
}

export interface FileContentResponse {
  path: string
  content: string
  size: number
}
