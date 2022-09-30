export interface HealthzResponse {
    status: 'py-youwol ok'
}

export type Label =
    | 'Label.DONE'
    | 'Label.INFO'
    | 'Label.STARTED'
    | 'Label.BASH'
    | 'Label.LOG_ABORT'
    | 'Label.EXCEPTION'
    | 'Label.FAILED'
    | 'EnvironmentStatusResponse'
    | 'PipelineStatusResponse'
    | 'PipelineStepStatusResponse'
    | 'PipelineStepEvent'
    | 'ProjectStatusResponse'
    | 'PackageDownloading'
    | 'ArtifactsResponse'
    | 'CdnResponse'
    | 'CdnStatusResponse'
    | 'CdnPackageResponse'
    | 'CheckUpdateResponse'
    | 'CheckUpdatesResponse'
    | 'DownloadEvent'
    | 'Label.PACKAGE_DOWNLOADING'
    | 'DownloadedPackageResponse'
    | 'PackageEventResponse'
    | 'ProjectsLoadingResults'
    | 'Label.PIPELINE_STEP_STATUS_PENDING'
    | 'Label.PIPELINE_STEP_RUNNING'
    | 'Label.RUN_PIPELINE_STEP'
    | 'HelmPackage'
    | 'Label.PROJECT_CREATING'

export interface ContextMessage<T = unknown> {
    contextId: string
    level: string
    text: string
    labels: Label[]
    parentContextId: string | undefined
    data: T
    attributes: { [key: string]: string }
}

export type GetFileContentResponse = string
