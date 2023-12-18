export interface Failure {
    path: string
    failure: string
    message: string
}

export interface Target {
    family: 'application' | 'library' | 'service'
}

export interface Link {
    name: string
    url: string
}

export interface FileListing {
    include: string[]
    ignore: string[]
}

export interface Artifacts {
    id: string
    files: FileListing
    links: Link[]
}

export interface PipelineStep {
    id: string
    artifacts: Artifacts[]
}

export interface Flow {
    name: string
    dag: string[]
}

export interface Pipeline {
    target: Target
    tags: string[]
    description: string
    steps: PipelineStep[]
    flows: Flow[]
}

export interface Project {
    pipeline: Pipeline
    path: string
    name: string
    id: string
    version: string
}

export interface ProjectsLoadingResults {
    results: (Project | Failure)[]
}
export type GetProjectsStatusResponse = ProjectsLoadingResults

export type ProjectsLoadingResultsResponse = ProjectsLoadingResults

export interface ChildToParentConnections {
    id: string
    parentIds: string[]
}

export interface DependenciesResponse {
    above: string[]
    below: string[]
    dag: ChildToParentConnections[]
    simpleDag: ChildToParentConnections[]
}

export interface ProjectStatus {
    projectId: string
    projectName: string
    workspaceDependencies: DependenciesResponse[]
}
export type GetProjectStatusResponse = ProjectStatus

export interface Artifact {
    id: string
    path: string
    links: Link[]
}
export type ArtifactsResponse = Artifact

export type GetArtifactResponse = Artifact

export interface Manifest {
    succeeded: boolean
    fingerprint: string
    creationDate: string
    files: string[]
    cmdOutputs: string[] | { [key: string]: unknown }
}

export interface PipelineStepStatus {
    id: string
    path: string
    links: Link[]
}

export interface PipelineStepStatusResponse {
    projectId: string
    flowId: string
    stepId: string
    artifactFolder: string
    artifacts: Artifact[]
    manifest?: Manifest
    status: 'OK' | 'KO' | 'outdated' | 'none'
}
export type GetPipelineStepStatusResponse = PipelineStepStatusResponse

export type RunStepResponse = PipelineStepStatusResponse

export interface PipelineStatus {
    projectId: string
    steps: PipelineStepStatusResponse[]
}

export type PipelineStatusResponse = PipelineStatus

export type ProjectStatusResponse = ProjectStatus

export type GetPipelineStatusResponse = PipelineStatus

export interface GetArtifactsResponse {
    artifacts: Artifact[]
}

export type PipelineStepEventKind =
    | 'runStarted'
    | 'runDone'
    | 'statusCheckStarted'

export interface PipelineStepEvent {
    projectId: string
    flowId: string
    stepId: string
    event: PipelineStepEventKind
}

export interface CreateProjectFromTemplateBody {
    type: string
    parameters: { [k: string]: string }
}

export type CreateProjectFromTemplateResponse = Project
