import { Shell, shell$, testSetup$, testTearDown$ } from './shell'
import { RootRouter, send } from '@youwol/http-primitives'
import { mergeMap, reduce, takeWhile, tap } from 'rxjs/operators'
import { firstValueFrom, merge } from 'rxjs'
import { PackageEventResponse } from '../lib/routers/local-cdn'
import { DownloadEvent } from '../lib/routers/system'
import { PyYouwolClient } from '../lib'

jest.setTimeout(10 * 1000)
const pyYouwol = new PyYouwolClient()

let currentShell: Shell<unknown> = undefined

beforeEach(async () => {
    await firstValueFrom(testSetup$())
})

afterEach(async () => {
    await firstValueFrom(testTearDown$(currentShell))
})

test('download flux-builder#latest from app URL', async () => {
    class Context {
        public readonly assetId =
            'YTZjZDhlMzYtYTE5ZC00YTI5LTg3NGQtMDRjMTI2M2E5YjA3'
    }

    const test$ = shell$<Context>(new Context()).pipe(
        tap((shell: Shell<Context>) => (currentShell = shell)),
        send<string, Context>({
            inputs: (shell) => {
                return {
                    commandType: 'query',
                    path: `${
                        RootRouter.HostName
                    }/applications/@youwol/flux-builder/latest?id=${window.atob(
                        shell.context.assetId,
                    )}`,
                }
            },
            sideEffects: (response) => {
                expect(
                    response.includes(
                        `href="/applications/@youwol/flux-builder/`,
                    ),
                ).toBeTruthy()
            },
        }),
        mergeMap(() =>
            merge(
                pyYouwol.admin.system.webSocket.downloadEvent$(),
                pyYouwol.admin.localCdn.webSocket.packageEvent$({
                    packageName: '@youwol/flux-builder',
                }),
            ),
        ),
        takeWhile((event) => {
            return event['data'] && event['data']['type'] != 'succeeded'
        }, true),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            // in theory: DownloadEvent.enqueued, DownloadEvent.started, PackageEventResponse.downloadStarted,
            // PackageEventResponse.downloadDone, DownloadEvent.succeeded
            // BUT: the enqueued event is not always caught (e.g. if this test runs in standalone) as
            // ws connection may have been connected after this message is sent
            if (![4, 5].includes(events.length)) {
                console.error(
                    'Error: download flux-builder#latest from app URL -> wrong events count',
                )
                console.log(events)
            }
            expect([4, 5].includes(events.length)).toBeTruthy()
            const count = events.length
            expect(
                (events[count - 2].data as PackageEventResponse).packageName,
            ).toBe('@youwol/flux-builder')
            expect((events[count - 1].data as DownloadEvent).rawId).toBe(
                window.btoa('@youwol/flux-builder'),
            )
        }),
    )
    await firstValueFrom(test$)
})
