import { combineLatest } from 'rxjs'
import { map, reduce, take, tap } from 'rxjs/operators'
import { raiseHTTPErrors, Test } from '@youwol/http-clients'
import { PyYouwolClient } from '../lib'

export function resetPyYouwolDbs$(headers: { [k: string]: string } = {}) {
    return new PyYouwolClient(headers).admin.customCommands.doGet$({
        name: 'reset',
    })
}

export function uniqueProjectName(prefix: string) {
    const now = new Date()
    return `@${prefix}/${now.getFullYear()}-${
        now.getMonth() + 1
    }-${now.getDate()}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
}

export function expectInitStep(stepResp) {
    expect(stepResp).toBeTruthy()
}

export function expectBuildStep(stepResp) {
    expect(stepResp.manifest.files).toHaveLength(3)
    expect(stepResp.artifacts).toHaveLength(1)
    expect(stepResp.artifacts[0].id).toBe('dist')
}

export function expectPublishLocal(stepResp) {
    expect(stepResp.manifest).toBeTruthy()
    Test.expectAttributes(stepResp.manifest, [
        'succeeded',
        'fingerprint',
        'creationDate',
        'cmdOutputs',
    ])
    expect(stepResp.manifest.succeeded).toBeTruthy()
    Test.expectAttributes(stepResp.manifest.cmdOutputs, [
        'name',
        'version',
        'id',
        'fingerprint',
        'srcFilesFingerprint',
        'srcBasePath',
        'srcFiles',
    ])
}

export function expectPublishRemote(stepResp) {
    expect(stepResp.status).toBe('OK')
}

export function expectFlowStatus(resp, projectName) {
    expect(resp.projectId).toEqual(
        Buffer.from(projectName, 'utf8').toString('base64'),
    )
    expect(resp.steps).toHaveLength(3)
    resp.steps.forEach((step) => {
        Test.expectAttributes(step, [
            'projectId',
            'flowId',
            'stepId',
            'artifacts',
        ])
        expect(step.status).toBe('none')
    })
}

export function expectProjectsStatus(resp, projectName) {
    expect(resp.results).toHaveLength(1)
    Test.expectAttributes(resp.results[0], ['path', 'name', 'version', 'id'])
    Test.expectAttributes(resp.results[0]['pipeline'], [
        'target',
        'tags',
        'steps',
        'flows',
    ])
    expect(resp.results[0]['name']).toBe(projectName)
}

export function expectProjectStatus(resp) {
    Test.expectAttributes(resp, [
        'projectId',
        'projectName',
        'workspaceDependencies',
    ])
    Test.expectAttributes(resp.workspaceDependencies, [
        'above',
        'below',
        'dag',
        'simpleDag',
    ])
}

export function expectEnvironment(resp) {
    Test.expectAttributes(resp, [
        'configuration',
        'users',
        'userInfo',
        'remoteGatewayInfo',
        'remotesInfo',
    ])
    Test.expectAttributes(resp.configuration, [
        'availableProfiles',
        'httpPort',
        'openidHost',
        'commands',
        'userEmail',
        'selectedRemote',
        'pathsBook',
    ])
}

export function expectUpdateStatus(resp) {
    Test.expectAttributes(resp, [
        'packageName',
        'localVersionInfo',
        'remoteVersionInfo',
        'status',
    ])
    Test.expectAttributes(resp.localVersionInfo, ['version', 'fingerprint'])
    Test.expectAttributes(resp.remoteVersionInfo, ['version', 'fingerprint'])
}

export function expectPipelineStepEvents$(pyYouwol: PyYouwolClient) {
    return pyYouwol.admin.projects.webSocket.stepEvent$().pipe(
        map((ev) => ev.data),
        take(12),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            expect(events).toHaveLength(12)
            expect(events.filter((ev) => ev.stepId == 'init')).toHaveLength(3)
            expect(events.filter((ev) => ev.stepId == 'build')).toHaveLength(4)
            expect(
                events.filter((ev) => ev.stepId == 'cdn-local'),
            ).toHaveLength(5)
            /*expect(
                events.filter((ev) => ev.stepId == 'publish-remote'),
            ).toHaveLength(6)*/
            expect(
                events.filter((ev) => ev.event == 'runStarted'),
            ).toHaveLength(3)
            expect(events.filter((ev) => ev.event == 'runDone')).toHaveLength(3)
        }),
    )
}

export function expectArtifacts$(pyYouwol: PyYouwolClient, projectId: string) {
    return combineLatest([
        pyYouwol.admin.projects
            .getArtifacts$({ projectId, flowId: 'prod' })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.artifacts$({ projectId }),
    ]).pipe(
        tap(([respHttp, respWs]) => {
            Test.expectAttributes(respHttp, ['artifacts'])
            expect(respHttp.artifacts).toHaveLength(1)
            expect(respHttp.artifacts[0].id).toBe('dist')
            Test.expectAttributes(respWs.attributes, ['projectId', 'flowId'])
            expect(respWs.data).toEqual(respHttp)
        }),
    )
}

export function expectDownloadEvents$(pyYouwol: PyYouwolClient) {
    return pyYouwol.admin.localCdn.webSocket.packageEvent$().pipe(
        take(4),
        map((ev) => ev.data.event),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            expect(events).toEqual([
                'downloadStarted',
                'downloadDone',
                'updateCheckStarted',
                'updateCheckDone',
            ])
        }),
    )
}
