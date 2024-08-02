import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
    filterCtxMessage,
} from '@youwol/http-primitives'

import {
    GetProjectsStatusResponse,
    PipelineStepEvent,
    PipelineStepStatusResponse,
    GetProjectStatusResponse,
    GetPipelineStatusResponse,
    GetArtifactsResponse,
    ArtifactsResponse,
    ProjectStatusResponse,
    PipelineStatusResponse,
    ProjectsLoadingResultsResponse,
    GetPipelineStepStatusResponse,
    RunStepResponse,
    PipelineStepEventKind,
    CreateProjectFromTemplateBody,
    CreateProjectFromTemplateResponse,
} from './interfaces'
import { WsRouter } from '../../py-youwol.client'
import { Label } from '../../interfaces'

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    status$(): WebSocketResponse$<ProjectsLoadingResultsResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<ProjectsLoadingResultsResponse, Label>({
                withLabels: ['ProjectsLoadingResults'],
            }),
        )
    }

    projectStatus$(
        filters: { projectId?: string } = {},
    ): WebSocketResponse$<ProjectStatusResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<ProjectStatusResponse, Label>({
                withLabels: ['ProjectStatusResponse'],
                withAttributes: filters,
            }),
        )
    }

    pipelineStatus$(
        filters: { projectId?: string; flowId?: string } = {},
    ): WebSocketResponse$<PipelineStatusResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<PipelineStatusResponse, Label>({
                withLabels: ['PipelineStatusResponse'],
                withAttributes: filters,
            }),
        )
    }

    pipelineStepStatus$(
        filters: { projectId?: string; flowId?: string; stepId?: string } = {},
    ): WebSocketResponse$<PipelineStepStatusResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<PipelineStepStatusResponse, Label>({
                withLabels: ['PipelineStepStatusResponse'],
                withAttributes: filters,
            }),
        )
    }

    artifacts$(
        filters: { projectId?: string; flowId?: string } = {},
    ): WebSocketResponse$<ArtifactsResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<ArtifactsResponse, Label>({
                withLabels: ['ArtifactsResponse'],
                withAttributes: filters,
            }),
        )
    }

    stepEvent$(
        filters: {
            projectId?: string
            flowId?: string
            stepId?: string
            event?: PipelineStepEventKind
        } = {},
    ): WebSocketResponse$<PipelineStepEvent, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<PipelineStepEvent, Label>({
                withLabels: ['PipelineStepEvent'],
                withDataAttributes: filters,
            }),
        )
    }
}

export class ProjectsRouter extends Router {
    public readonly webSocket: WebSocketAPI

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/projects`)
        this.webSocket = new WebSocketAPI(ws)
    }

    /**
     * Status
     *
     * @param callerOptions
     */
    status$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetProjectsStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/status`,
            callerOptions,
        })
    }

    /**
     * Index projects.
     *
     * @param callerOptions
     */
    index$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetProjectsStatusResponse> {
        return this.send$({
            command: 'update',
            path: `/index`,
            callerOptions,
        })
    }

    getProjectStatus$({
        projectId,
        callerOptions,
    }: {
        projectId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetProjectStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/${projectId}`,
            callerOptions,
        })
    }

    getArtifacts$({
        projectId,
        flowId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetArtifactsResponse> {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}/artifacts`,
            callerOptions,
        })
    }

    /**
     * Pipeline status
     *
     * @param projectId
     * @param flowId
     * @param callerOptions
     */
    getPipelineStatus$({
        projectId,
        flowId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetPipelineStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}`,
            callerOptions,
        })
    }

    /**
     * Flow status
     *
     * @param projectId
     * @param flowId
     * @param stepId
     * @param callerOptions
     */
    getPipelineStepStatus$({
        projectId,
        flowId,
        stepId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetPipelineStepStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}`,
            callerOptions,
        })
    }

    /**
     * Run a step
     *
     * @param projectId
     * @param flowId
     * @param stepId
     * @param callerOptions
     */
    runStep$({
        projectId,
        flowId,
        stepId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<RunStepResponse> {
        return this.send$({
            command: 'update',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}/run`,
            callerOptions,
        })
    }

    /**
     * Create a new project from a template
     *
     * @param body
     * @param callerOptions
     */
    createProjectFromTemplate$({
        body,
        callerOptions,
    }: {
        body: CreateProjectFromTemplateBody
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<CreateProjectFromTemplateResponse> {
        return this.send$({
            command: 'create',
            path: `/create-from-template`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }

    /**
     * Return the view of a step
     *
     * @param projectId project's id
     * @param flow flow's id
     * @param stepId step's id
     * @param callerOptions
     */
    getStepView$({
        projectId,
        flowId,
        stepId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<string> {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}/view`,
            callerOptions,
        })
    }

    /**
     * Execute a GET command of a pipeline's step
     *
     * @param projectId project's id
     * @param flow flow's id
     * @param stepId step's id
     * @param commandId command's id
     * @param callerOptions
     */
    executeStepGetCommand$({
        projectId,
        flowId,
        stepId,
        commandId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        commandId: string
        callerOptions?: CallerRequestOptions
    }) {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}/commands/${commandId}`,
            callerOptions,
        })
    }

    /**
     * Retrieve the configuration of a pipeline's step
     *
     * @param projectId project's id
     * @param flow flow's id
     * @param stepId step's id
     * @param callerOptions
     */
    getStepConfiguration$({
        projectId,
        flowId,
        stepId,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        callerOptions?: CallerRequestOptions
    }) {
        return this.send$({
            command: 'query',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}/configuration`,
            callerOptions,
        })
    }

    /**
     * Update the configuration of a pipeline's step
     *
     * @param projectId project's id
     * @param flow flow's id
     * @param stepId step's id
     * @param callerOptions
     */
    updateStepConfiguration$({
        projectId,
        flowId,
        stepId,
        body,
        callerOptions,
    }: {
        projectId: string
        flowId: string
        stepId: string
        body: unknown
        callerOptions?: CallerRequestOptions
    }) {
        return this.send$({
            command: 'update',
            path: `/${projectId}/flows/${flowId}/steps/${stepId}/configuration`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }
}
