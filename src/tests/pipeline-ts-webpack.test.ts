import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'

import { combineLatest, firstValueFrom, of } from 'rxjs'
import { skipWhile, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'

import { setup$ } from './local-youwol-test-setup'
import {
    CreateProjectFromTemplateBody,
    CreateProjectFromTemplateResponse,
} from '../lib/routers/projects'
import { applyTestCtxLabels, resetTestCtxLabels } from './shell'

const pyYouwol = new PyYouwolClient()

beforeEach(async () => {
    await firstValueFrom(
        setup$({
            localOnly: true,
            email: 'int_tests_yw-users@test-user',
            clearProjects: true,
        }).pipe(tap(() => applyTestCtxLabels())),
    )
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

function testProjectCreationBase(body: CreateProjectFromTemplateBody) {
    const projectStatusWs$ = pyYouwol.admin.projects.webSocket.status$().pipe(
        skipWhile((respWs) => {
            return (
                respWs.data.results.find(
                    (p: CreateProjectFromTemplateResponse) =>
                        p.name == body.parameters['name'],
                ) == undefined
            )
        }),
        take(1),
    )
    const createProject = pyYouwol.admin.projects
        .createProjectFromTemplate$({
            body,
        })
        .pipe(raiseHTTPErrors())

    return combineLatest([projectStatusWs$, createProject]).pipe(
        tap(([respWs, respHttp]) => {
            expectAttributes(respHttp, [
                'pipeline',
                'path',
                'name',
                'publishName',
                'id',
                'version',
            ])
            expectAttributes(respWs.data, ['results'])
            const found = respWs.data.results.find(
                (p: CreateProjectFromTemplateResponse) => p.id == respHttp.id,
            )
            expect(found).toBeTruthy()
        }),
    )
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in testProjectCreationBase
test('pyYouwol.admin.projects.createProjectFromTemplate ts-webpack lib', async () => {
    await firstValueFrom(
        testProjectCreationBase({
            type: 'ts+webpack library',
            parameters: { name: 'test-lib' },
        }),
    )
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in testProjectCreationBase
test('pyYouwol.admin.projects.createProjectFromTemplate  ts-webpack app', async () => {
    await firstValueFrom(
        testProjectCreationBase({
            type: 'ts+webpack app.',
            parameters: { name: 'test-app', "dev-server's port": '5000' },
        }),
    )
})
