import { expectAttributes, raiseHTTPErrors } from '@youwol/http-primitives'
import { PyYouwolClient } from '../lib'
import { Shell, testSetup$, testTearDown$ } from './shell'
import { firstValueFrom } from 'rxjs'

const pyYouwol = new PyYouwolClient()

const currentShell: Shell<unknown> = undefined

beforeEach(async () => {
    await firstValueFrom(
        testSetup$({
            localOnly: true,
            email: 'int_tests_yw-users@test-user',
            clearProjects: false,
        }),
    )
})

afterEach(async () => {
    await firstValueFrom(testTearDown$(currentShell))
})

test('query healthz', async () => {
    const test$ = pyYouwol.getHealthz$().pipe(raiseHTTPErrors())
    const resp = await firstValueFrom(test$)
    expect(resp.status).toBe('py-youwol ok')
})

test('pyYouwol.admin.environment.login', async () => {
    const test$ = pyYouwol.admin.environment
        .login$({
            body: { authId: 'int_tests_yw-users_bis@test-user', envId: 'prod' },
        })
        .pipe(raiseHTTPErrors())

    const resp = await firstValueFrom(test$)
    expectAttributes(resp, ['id', 'name', 'email', 'memberOf'])
    expect(resp.name).toBe('int_tests_yw-users_bis@test-user')
})

test('pyYouwol.admin.customCommands.doPost$', async () => {
    const test$ = pyYouwol.admin.customCommands.doPost$({
        name: 'test-cmd-post',
        body: {
            returnObject: { status: 'test-cmd-post ok' },
        },
    })
    const resp = await firstValueFrom(test$)
    expect(resp).toEqual({ status: 'test-cmd-post ok' })
})

test('pyYouwol.admin.customCommands.doPut$', async () => {
    const test$ = pyYouwol.admin.customCommands.doPut$({
        name: 'test-cmd-put',
        body: {
            returnObject: { status: 'test-cmd-put ok' },
        },
    })

    const resp = await firstValueFrom(test$)
    expect(resp).toEqual({ status: 'test-cmd-put ok' })
})

test('pyYouwol.admin.customCommands.doDelete$', async () => {
    const test$ = pyYouwol.admin.customCommands.doDelete$({
        name: 'test-cmd-delete',
    })
    const resp = await firstValueFrom(test$)
    expect(resp).toEqual({ status: 'deleted' })
})
