/* eslint-disable jest/no-done-callback -- eslint-comment It is required because */

import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'

import { btoa } from 'buffer'
import { combineLatest, Observable, of } from 'rxjs'
import { filter, map, mergeMap, reduce, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'

import {
    expectArtifacts$,
    expectBuildStep,
    expectFlowStatus,
    expectInitStep,
    expectPipelineStepEvents$,
    expectProjectsStatus,
    expectProjectStatus,
    expectPublishLocal,
    uniqueProjectName,
} from './utils'
import { setup$ } from './local-youwol-test-setup'
import { PipelineStepStatusResponse } from '../lib/routers/projects'

const pyYouwol = new PyYouwolClient()

let projectName: string

beforeAll(async (done) => {
    projectName = uniqueProjectName('todo-app-js')
    setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    })
        .pipe(
            mergeMap(() =>
                pyYouwol.admin.customCommands.doPost$({
                    name: 'clone-project',
                    body: {
                        url: 'https://github.com/youwol/todo-app-js.git',
                        name: projectName,
                    },
                }),
            ),
            mergeMap(() => {
                return pyYouwol.admin.customCommands.doDelete$({
                    name: 'purge-downloads',
                })
            }),
        )
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('pyYouwol.admin.projects.status', (done) => {
    combineLatest([
        pyYouwol.admin.projects.status$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.status$(),
    ])
        .pipe(take(1))
        .subscribe(([respHttp, respWs]) => {
            expectProjectsStatus(respHttp, projectName)
            expectProjectsStatus(respWs.data, projectName)
            // respWs contains more fields than respHttp...e.g. pipeline.target (related to pb with union?)
            // expect(respHttp).toEqual(respWs.data)
            done()
        })
})

test('pyYouwol.admin.projects.projectStatus', (done) => {
    const projectId = btoa(projectName)

    combineLatest([
        pyYouwol.admin.projects
            .getProjectStatus$({ projectId })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.projectStatus$({ projectId }),
    ]).subscribe(([respHttp, respWs]) => {
        expectProjectStatus(respHttp)
        expectAttributes(respWs.attributes, ['projectId'])
        expect(respWs.data).toEqual(respHttp)
        done()
    })
})

test('pyYouwol.admin.projects.flowStatus', (done) => {
    combineLatest([
        pyYouwol.admin.projects
            .getPipelineStatus$({
                projectId: btoa(projectName),
                flowId: 'prod',
            })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.pipelineStatus$(),
    ])
        .pipe(take(1))
        .subscribe(([respHttp, respWs]) => {
            expectFlowStatus(respHttp, projectName)
            expectAttributes(respWs.attributes, ['projectId', 'flowId'])
            expect(respHttp).toEqual(respWs.data)
            done()
        })
})

function run$(stepId: string): Observable<PipelineStepStatusResponse> {
    return combineLatest([
        pyYouwol.admin.projects
            .runStep$({ projectId: btoa(projectName), flowId: 'prod', stepId })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.projects.webSocket.pipelineStepStatus$({ stepId }).pipe(
            map((d) => d.data),
            filter((message) => message.status == 'OK'),
            take(1),
            reduce((acc, e) => [...acc, e], []),
        ),
    ]).pipe(map(([_, respWs]) => respWs.find((step) => step.stepId == stepId)))
}

test('pyYouwol.admin.projects.runStep', (done) => {
    const projectId = btoa(projectName)
    const steps$ = expectPipelineStepEvents$(pyYouwol)

    expectArtifacts$(pyYouwol, projectId)
    const runs$ = of(0).pipe(
        mergeMap(() => {
            return run$('init')
        }),
        tap((resp) => {
            expectInitStep(resp)
        }),
        mergeMap(() => {
            return run$('build')
        }),
        tap((resp) => {
            expectBuildStep(resp)
        }),
        mergeMap(() => {
            return run$('cdn-local')
        }),
        tap((resp) => {
            expectPublishLocal(resp)
        }),
        mergeMap(() => {
            return expectArtifacts$(pyYouwol, projectId)
        }),
    )
    combineLatest([runs$, steps$]).subscribe(([artifacts, steps]) => {
        expect(artifacts).toBeTruthy()
        expect(steps).toBeTruthy()
        done()
        /* no op */
    })
})
/* eslint-enable jest/no-done-callback -- re-enable */
