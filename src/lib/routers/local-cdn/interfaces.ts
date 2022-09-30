export interface PackageVersionInfo {
    version: string
    fingerprint: string
}

export type UpdateStatus =
    | 'upToDate'
    | 'mismatch'
    | 'remoteAhead'
    | 'localAhead'

export interface CdnVersion {
    version: string
    filesCount: number
    entryPointSize: number // in bytes
}

export interface CdnVersionLight {
    version: string
}

export interface CdnPackage {
    name: string
    id: string
    versions: CdnVersion[]
}

export interface CdnPackageLight {
    name: string
    id: string
    versions: CdnVersionLight[]
}

export interface CdnStatusResponse {
    packages: CdnPackageLight[]
}
export interface GetCdnStatusResponse extends CdnStatusResponse {}

export interface GetPackageResponse extends CdnPackage {}

export interface CdnPackageResponse extends CdnPackage {}

export interface CheckUpdateResponse {
    status: UpdateStatus
    packageName: string
    localVersionInfo: PackageVersionInfo
    remoteVersionInfo: PackageVersionInfo
}

export interface CheckUpdatesResponse {
    updates: CheckUpdateResponse[]
}

export interface TriggerCollectUpdatesResponse extends CheckUpdatesResponse {}

export interface DownloadPackageBody {
    packageName: string
    version: string
}

export interface DownloadPackagesBody {
    packages: DownloadPackageBody[]
    checkUpdateStatus: boolean
}

export interface DownloadedPackageResponse {
    packageName: string
    version: string
    versions: string[]
    fingerprint: string
}

export interface ResetCdnBody {
    keepProjectPackages?: boolean
}

export interface ResetCdnResponse {
    deletedPackages: string[]
}

export interface PackageDownloading {
    packageName: string
    version: string
}

export interface PackageEvent {
    packageName: string
    version: string
    event:
        | 'downloadStarted'
        | 'downloadDone'
        | 'updateCheckStarted'
        | 'updateCheckDone'
}

export interface PackageEventResponse extends PackageEvent {}
