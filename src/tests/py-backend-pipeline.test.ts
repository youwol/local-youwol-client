import { PyYouwolClient, Routers } from '../lib'
import { delay, tap } from 'rxjs/operators'
import { expectAttributes, RootRouter, send } from '@youwol/http-primitives'
import { firstValueFrom } from 'rxjs'
import { Shell, shell$, testSetup$, testTearDown$ } from './shell'
import {
    createProject,
    getEnvironmentStatus,
    getProjectsStatus,
    installBackend,
    runStep,
} from './steps'

jest.setTimeout(120 * 1000)
const pyYouwol = new PyYouwolClient()

let currentShell: Shell<unknown> = undefined

class Context {
    public readonly name = 'py_backend_test'
    public readonly backendDefaultPort = 2002
    public readonly project?: Routers.Projects.Project
    constructor(params: { project?: Routers.Projects.Project } = {}) {
        Object.assign(this, params)
    }
}

beforeEach(async () => {
    await firstValueFrom(
        testSetup$({
            clearProjects: true,
            localOnly: true,
            email: 'int_tests_yw-users@test-user',
        }),
    )
})
afterEach(async () => {
    await firstValueFrom(testTearDown$(currentShell))
})

function expectProject(resp: Routers.Projects.Project, name: string) {
    expect(resp.path.endsWith(`${name}_project`)).toBeTruthy()
    expect(resp.name).toBe(name)
    expect(resp.pipeline.steps).toHaveLength(6)
    expect(resp.pipeline.flows).toHaveLength(1)
}

function expectSetupStep(
    stepResp: Routers.Projects.PipelineStepStatusResponse,
    name: string,
) {
    expect(stepResp.stepId).toBe('setup')
    expect(stepResp.status).toBe('OK')
    expect(stepResp.manifest.files).toHaveLength(1)
    expect(stepResp.manifest.files[0].endsWith('pyproject.toml')).toBeTruthy()
    expect(stepResp.artifacts).toHaveLength(0)
    expect(stepResp.manifest.cmdOutputs['package_json']).toEqual({
        name,
        version: '0.1.0',
        main: 'start.sh',
        webpm: { type: 'backend' },
    })
}

function expectDependenciesStep(
    stepResp: Routers.Projects.PipelineStepStatusResponse,
) {
    expect(stepResp.stepId).toBe('dependencies')
    expect(stepResp.status).toBe('OK')
    expect(stepResp.manifest.files).toHaveLength(1)
    expect(stepResp.manifest.files[0].endsWith('requirements.txt')).toBeTruthy()
    expect(stepResp.artifacts).toHaveLength(0)
}

function expectPackageStep(
    stepResp: Routers.Projects.PipelineStepStatusResponse,
    name: string,
) {
    expect(stepResp.stepId).toBe('package')
    expect(stepResp.status).toBe('OK')
    expect(
        stepResp.manifest.files.find((file) =>
            file.endsWith(`dist/${name}-0.1.0-py3-none-any.whl`),
        ),
    ).toBeTruthy()
    expect(
        stepResp.manifest.files.find((file) =>
            file.endsWith(`dist/${name}-0.1.0.tar.gz`),
        ),
    ).toBeTruthy()
    expect(
        stepResp.manifest.files.find((file) => file.endsWith(`install.sh`)),
    ).toBeTruthy()
    expect(
        stepResp.manifest.files.find((file) => file.endsWith(`start.sh`)),
    ).toBeTruthy()
}

function expectCdnLocalStep(
    stepResp: Routers.Projects.PipelineStepStatusResponse,
) {
    expect(stepResp.stepId).toBe('cdn-local')
    expect(stepResp.status).toBe('OK')
    expect(stepResp.manifest.succeeded).toBeTruthy()
    expect(stepResp.manifest.fingerprint).toBeTruthy()
}

test('py_backend pipeline happy path', async () => {
    const test$ = shell$(new Context()).pipe(
        tap((shell) => (currentShell = shell)),
        createProject({
            inputs: (shell) => ({
                body: {
                    type: 'python backend',
                    parameters: {
                        name: shell.context.name,
                        port: `${shell.context.backendDefaultPort}`,
                    },
                },
            }),
            sideEffects: (resp, shell) => {
                expectProject(resp, shell.context.name)
            },
            newContext: (shell, resp) =>
                new Context({ ...shell.context, project: resp }),
        }),
        getProjectsStatus({
            sideEffects: (resp) => {
                expect(resp.results).toHaveLength(1)
            },
        }),
        runStep({
            inputs: (shell) => ({
                projectName: shell.context.project.name,
                stepId: 'setup',
            }),
            sideEffects: (resp, shell) => {
                expectSetupStep(resp, shell.context.name)
            },
        }),
        runStep({
            inputs: (shell) => ({
                projectName: shell.context.project.name,
                stepId: 'dependencies',
            }),
            sideEffects: (resp) => {
                expectDependenciesStep(resp)
            },
        }),
        tap((shell) => {
            // This step won't finish, until 'stop_backend' is called
            return pyYouwol.admin.projects
                .runStep$({
                    projectId: shell.context.project.id,
                    flowId: 'prod',
                    stepId: 'run',
                })
                .subscribe()
        }),
        delay(1000),
        getEnvironmentStatus({
            sideEffects: (resp, shell) => {
                expect(resp.youwolEnvironment.proxiedBackends).toHaveLength(1)
                const proxy = resp.youwolEnvironment.proxiedBackends[0]
                expectAttributes(proxy, ['name', 'version', 'port'])
                expect(proxy.name).toBe(shell.context.name)
                expect(proxy.version).toBe(shell.context.project.version)
            },
        }),
        send<string, Context>({
            inputs: (shell) => {
                const project = shell.context.project
                return {
                    commandType: 'query',
                    path: `${RootRouter.HostName}/backends/${project.name}/${project.version}/hello-world`,
                }
            },
            sideEffects: (resp) => {
                expect(resp.endpoint).toBe('/hello-world')
            },
        }),
        tap((shell) => {
            return pyYouwol.admin.projects
                .executeStepGetCommand$({
                    projectId: shell.context.project.id,
                    flowId: 'prod',
                    stepId: 'run',
                    commandId: 'stop_backend',
                })
                .subscribe()
        }),
        delay(1000),
        send<string, Context>({
            inputs: (shell) => {
                const project = shell.context.project
                return {
                    commandType: 'query',
                    path: `${RootRouter.HostName}/backends/${project.name}/${project.version}/hello-world`,
                }
            },
            authorizedErrors: (resp) => resp.status === 404,
        }),
        getEnvironmentStatus({
            sideEffects: (resp) => {
                expect(resp.youwolEnvironment.proxiedBackends).toHaveLength(0)
            },
        }),
        runStep({
            inputs: (shell: Shell<Context>) => ({
                projectName: shell.context.project.name,
                stepId: 'package',
            }),
            sideEffects: (resp, shell) => {
                expectPackageStep(resp, shell.context.name)
            },
        }),
        runStep({
            inputs: (shell: Shell<Context>) => ({
                projectName: shell.context.project.name,
                stepId: 'cdn-local',
            }),
            sideEffects: (resp) => {
                expectCdnLocalStep(resp)
            },
        }),
        installBackend({
            inputs: (shell: Shell<Context>) => {
                const project = shell.context.project
                return {
                    fromPath: `${RootRouter.HostName}/backends/${project.name}/${project.version}/docs`,
                }
            },
        }),
        getEnvironmentStatus({
            sideEffects: (resp) => {
                expect(resp.youwolEnvironment.proxiedBackends).toHaveLength(1)
            },
        }),
    )
    await firstValueFrom(test$)
})
