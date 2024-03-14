import { expectAttributes, raiseHTTPErrors } from '@youwol/http-primitives'
import { combineLatest, forkJoin } from 'rxjs'
import { map, mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'
import { readFileSync } from 'fs'
import { CdnBackend } from '@youwol/http-clients'
import { EnvironmentStatusResponse } from '../lib/routers/environment'

export function uniqueProjectName(prefix: string) {
    const now = new Date()
    return `@${prefix}/${now.getFullYear()}-${
        now.getMonth() + 1
    }-${now.getDate()}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`
}

export function expectPackageStep(stepResp) {
    expect(stepResp.manifest.files).toHaveLength(8)
    expect(stepResp.artifacts).toHaveLength(1)
    expect(stepResp.artifacts[0].id).toBe('package')
}

export function expectPublishLocal(stepResp, succeeded: boolean) {
    expect(stepResp.manifest).toBeTruthy()
    expectAttributes(stepResp.manifest, [
        'succeeded',
        'fingerprint',
        'creationDate',
        'cmdOutputs',
    ])
    expect(stepResp.manifest.succeeded).toBe(succeeded)
    if (succeeded) {
        expectAttributes(stepResp.manifest.cmdOutputs, [
            'name',
            'version',
            'id',
            'fingerprint',
            'srcFilesFingerprint',
            'srcBasePath',
            'srcFiles',
        ])
    }
}

export function expectFlowStatus(resp, projectName) {
    expect(resp.projectId).toEqual(
        Buffer.from(projectName, 'utf8').toString('base64'),
    )
    expect(resp.steps).toHaveLength(2)
    resp.steps.forEach((step) => {
        expectAttributes(step, ['projectId', 'flowId', 'stepId', 'artifacts'])
        expect(step.status).toBe('none')
    })
}

export function expectProjectsStatus(resp, projectName) {
    const project = resp.results.find((p) => p.name == projectName)
    expectAttributes(project, ['path', 'name', 'version', 'id'])
    expectAttributes(project['pipeline'], ['target', 'tags', 'steps', 'flows'])
    expect(project['name']).toBe(projectName)
}

export function expectProjectStatus(resp) {
    expectAttributes(resp, [
        'projectId',
        'projectName',
        'workspaceDependencies',
    ])
    expectAttributes(resp.workspaceDependencies, [
        'above',
        'below',
        'dag',
        'simpleDag',
    ])
}

export function expectEnvironment(resp: EnvironmentStatusResponse) {
    expectAttributes(resp, ['youwolEnvironment'])
    expectAttributes(resp.youwolEnvironment, [
        'commands',
        'currentConnection',
        'customMiddlewares',
        'httpPort',
        'pathsBook',
        'proxiedBackends',
        'remotes',
    ])
    expectAttributes(resp.youwolEnvironment.currentConnection, [
        'envId',
        'authId',
    ])
    expectAttributes(resp.youwolEnvironment.remotes[0], [
        'envId',
        'host',
        'authentications',
    ])
    expectAttributes(resp.youwolEnvironment.remotes[0].authentications[0], [
        'authId',
        'type',
    ])
    // Below expectations are related to deprecated attributes
    expectAttributes(resp, [
        'configuration',
        'users',
        'userInfo',
        'remoteGatewayInfo',
        'remotesInfo',
    ])
}

export function expectUpdateStatus(resp) {
    expectAttributes(resp, [
        'packageName',
        'localVersionInfo',
        'remoteVersionInfo',
        'status',
    ])
    expectAttributes(resp.localVersionInfo, ['version', 'fingerprint'])
    expectAttributes(resp.remoteVersionInfo, ['version', 'fingerprint'])
}

export function expectPipelineStepEvents$(pyYouwol: PyYouwolClient) {
    return pyYouwol.admin.projects.webSocket.stepEvent$().pipe(
        map((ev) => ev.data),
        take(7),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            expect(events).toHaveLength(7)
            expect(events.filter((ev) => ev.stepId == 'package')).toHaveLength(
                3,
            )
            expect(
                events.filter((ev) => ev.stepId == 'cdn-local'),
            ).toHaveLength(4)
            expect(
                events.filter((ev) => ev.event == 'runStarted'),
            ).toHaveLength(2)
            expect(events.filter((ev) => ev.event == 'runDone')).toHaveLength(2)
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
            expectAttributes(respHttp, ['artifacts'])
            expect(respHttp.artifacts).toHaveLength(1)
            expect(respHttp.artifacts[0].id).toBe('package')
            expectAttributes(respWs.attributes, ['projectId', 'flowId'])
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

export function uploadPackages({
    filePaths,
    folderId,
    cdnClient,
}: {
    filePaths: string[]
    folderId: string
    cdnClient: CdnBackend.Client
}) {
    const obs$ = filePaths.map((filePath) => {
        const buffer = readFileSync(filePath)
        const filename = filePath.split('/').slice(-1)[0]
        const arraybuffer = Uint8Array.from(buffer).buffer
        return cdnClient
            .upload$({
                body: {
                    fileName: filename,
                    blob: new Blob([arraybuffer]),
                },
                queryParameters: { folderId },
            })
            .pipe(raiseHTTPErrors(), take(1))
    })
    return forkJoin(obs$)
}

export function uploadPackagesAndCheck$({
    packageName,
    paths,
    folderId,
    cdnClient,
    check,
}: {
    packageName: string
    paths: { [_k: string]: string } // version -> path
    folderId: string
    cdnClient: CdnBackend.Client
    check: 'strict' | 'loose'
}) {
    const versions = Object.keys(paths)
    return uploadPackages({
        filePaths: Object.values(paths),
        folderId: folderId,
        cdnClient,
    }).pipe(
        mergeMap(() =>
            cdnClient.getLibraryInfo$({
                libraryId: window.btoa(packageName),
            }),
        ),
        raiseHTTPErrors(),
        tap((resp) => {
            const missing = versions.filter((v) => !resp.versions.includes(v))
            if (missing.length > 0) {
                throw Error(
                    `uploadPackagesAndCheck$: Not all requested versions have been actually published, 
                    missing versions are: ${missing}`,
                )
            }
            if (
                check == 'strict' &&
                JSON.stringify(resp.versions.sort()) !==
                    JSON.stringify(versions.sort())
            ) {
                console.error(
                    `Some unexpected versions of ${packageName} are available in CDN`,
                    {
                        deployed: resp.versions.sort(),
                        local: versions.sort(),
                        unexpected: resp.versions.filter(
                            (v) => !versions.includes(v),
                        ),
                    },
                )
                throw Error(
                    `uploadPackagesAndCheck$: Some unexpected versions of ${packageName} are available in CDN`,
                )
            }
        }),
    )
}
