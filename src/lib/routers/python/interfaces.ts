export interface PyodideInfo {
    arch: string
    platform: string
    python: string
    version: string
}
export interface Package {
    name: string
    packageType: string
    fileName: string
    version: string
}
export interface Runtime {
    info: PyodideInfo
    packages: Package[]
}
export interface GetPythonStatusResponse {
    runtimes: Runtime[]
}
