import { RootRouter, send } from '@youwol/http-primitives'
import { firstValueFrom, merge, Observable, ReplaySubject } from 'rxjs'
import {
    addBookmarkLog,
    Shell,
    shell$,
    testSetup$,
    testTearDown$,
} from './shell'
import { DownloadEvent, InstallBackendEvent } from '../lib/routers/system'
import { map, mergeMap, reduce, takeWhile, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'

jest.setTimeout(60 * 1000)
const pyYouwol = new PyYouwolClient()

let currentShell: Shell<unknown> = undefined

beforeEach(async () => {
    await firstValueFrom(testSetup$())
})

afterEach(async () => {
    await firstValueFrom(testTearDown$(currentShell))
})

test('download & install backend', async () => {
    class Context {}
    const getTestPath = `${RootRouter.HostName}/backends/demo_yw_backend/0.1.0/docs`

    const backendEvents$ = new ReplaySubject<{
        data: DownloadEvent | InstallBackendEvent
    }>()
    const test$ = shell$<Context>(new Context()).pipe(
        // ensure shell's tearDown in 'afterEach'
        tap((shell) => (currentShell = shell)),
        // start recording 'download events'
        tap((shell) => {
            shell.addSubscription(
                'backendEvents',
                merge(
                    pyYouwol.admin.system.webSocket.downloadEvent$(),
                    pyYouwol.admin.system.webSocket.installBackendEvent$(),
                ).subscribe((d) => {
                    backendEvents$.next(d)
                }),
            )
        }),
        addBookmarkLog({ text: `Start` }),
        addBookmarkLog({
            text: `Trigger backend download & install from ${getTestPath}`,
        }),
        send<string, Context>({
            inputs: () => {
                return {
                    commandType: 'query',
                    path: getTestPath,
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
                expect(response.includes('<div id="swagger-ui">')).toBeTruthy()
            },
        }),
        send<string, Context>({
            inputs: () => {
                return {
                    commandType: 'query',
                    path: getTestPath,
                    nativeOptions: {
                        headers: { 'py-youwol-local-only': 'true' },
                    },
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
            },
        }),
        mergeMap(() => backendEvents$),
        takeWhile((m: { data: InstallBackendEvent }) => {
            return (
                m.data['rawId'] !== undefined ||
                (m.data.installId !== undefined && m.data.event !== 'succeeded')
            )
        }, true),
        reduce((acc, e) => {
            return [...acc, e]
        }, []),
        tap((events) => {
            expect(events).toHaveLength(4)
        }),
        map((events) => events.slice(-1)[0] as { data: InstallBackendEvent }),
    ) as Observable<{ data: InstallBackendEvent }>

    const lastInstallEvent = await firstValueFrom(test$)
    expect(lastInstallEvent.data.name).toBe('demo_yw_backend')
    expect(lastInstallEvent['data'].event).toBe('succeeded')
})
