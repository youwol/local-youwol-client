export interface LoginResponse {
    id: string
    name: string
    email: string
    memberOf: string[]
}

export interface Command {
    name: string
}

export interface PathsBook {
    config: string
    system: string
    databases: string
    projects: string[]
    additionalPythonScrPaths: string[]
    usersInfo: string
    remotesInfo: string
    secrets?: string
    youwol: string
}

export interface DeadlinedCache {
    value: unknown
    deadline: number
    dependencies: { [key: string]: string }
}

export interface K8sNodeInfo {
    cpu: string
    memory: string
    architecture: string
    kernelVersion: string
    operating_system: string
    os_image: string
}

export interface K8sInstanceInfo {
    access_token: string
    nodes: K8sNodeInfo[]
    k8s_api_proxy: string
}

export interface DockerRepository {
    name: string
    pullSecret: string
}

export interface K8sDockerRepositories {
    repositories: DockerRepository[]
}

export interface K8sInstance {
    instanceInfo: K8sInstanceInfo
    configFile: string
    contextName: string
    docker: K8sDockerRepositories
    host: string
    proxyPort: string
}

export interface ProjectTemplate {
    icon?: { [k: string]: unknown }
    type: string
    folder: string
    parameters: { [k: string]: string }
}

export interface PipelinesSourceInfo {
    projectTemplates: ProjectTemplate[]
}

export interface YouwolEnvironment {
    availableProfiles: string[]
    httpPort: number
    openidHost: string
    activeProfile?: string

    commands: { [key: string]: Command }

    userEmail?: string
    selectedRemote?: string

    pathsBook: PathsBook

    pipelinesSourceInfo?: PipelinesSourceInfo
    projectTemplates: ProjectTemplate[]
    customDispatches: CustomDispatch[]
    cache: { [key: string]: unknown }

    tokensCache: DeadlinedCache[]
}

export interface UserInfo {
    id: string
    name: string
    email: string
    memberOf: string[]
}

export interface RemoteGatewayInfo {
    name: string
    host: string
    connected: boolean
}

export interface EnvironmentStatusResponse {
    configuration: YouwolEnvironment
    users: string[]
    userInfo: UserInfo
    remoteGatewayInfo?: RemoteGatewayInfo
    remotesInfo: RemoteGatewayInfo[]
}
export type GetEnvironmentStatusResponse = EnvironmentStatusResponse

export type SwitchProfileResponse = EnvironmentStatusResponse

export interface CustomDispatch {
    type: string
    name: string
    activated?: boolean
    parameters: { [k: string]: string }
}

export interface QueryCustomDispatchesResponse {
    dispatches: { [k: string]: CustomDispatch[] }
}

export type QueryCowSayResponse = string

export class UploadAssetResponse {}
