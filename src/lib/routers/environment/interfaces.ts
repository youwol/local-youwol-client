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

export interface Projects {
    templates?: ProjectTemplate[]
}

export type AuthenticationType = 'BrowserAuth' | 'DirectAuth'

export class Authentication {
    authId: string
    type: AuthenticationType
}

export interface CloudEnvironment {
    envId: string
    host: string
    authentications: Authentication[]
}

export interface Connection {
    envId: string
    authId: string
}
export interface YouwolEnvironment {
    commands: { [key: string]: Command }
    currentConnection: Connection
    customMiddlewares: unknown[]
    httpPort: number
    pathsBook: PathsBook
    projects?: Projects
    proxiedBackends: ProxiedBackend[]
    remotes: CloudEnvironment[]
}

export class ProxiedBackend {
    name: string
    version: string
    port: string
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
    /**
     * @deprecated
     */
    configuration: YouwolEnvironment
    youwolEnvironment: YouwolEnvironment
    /**
     * @deprecated
     */
    users: string[]
    /**
     * @deprecated
     */
    userInfo: UserInfo
    /**
     * @deprecated
     */
    remoteGatewayInfo?: RemoteGatewayInfo
    /**
     * @deprecated
     */
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
