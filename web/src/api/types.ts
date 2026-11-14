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
