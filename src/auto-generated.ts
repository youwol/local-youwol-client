
const runTimeDependencies = {
    "externals": {
        "@youwol/http-primitives": "^0.2.0",
        "rxjs": "^7.5.6"
    },
    "includedInBundle": {}
}
const externals = {
    "@youwol/http-primitives": {
        "commonjs": "@youwol/http-primitives",
        "commonjs2": "@youwol/http-primitives",
        "root": "@youwol/http-primitives_APIv02"
    },
    "rxjs": {
        "commonjs": "rxjs",
        "commonjs2": "rxjs",
        "root": "rxjs_APIv7"
    },
    "rxjs/operators": {
        "commonjs": "rxjs/operators",
        "commonjs2": "rxjs/operators",
        "root": [
            "rxjs_APIv7",
            "operators"
        ]
    }
}
const exportedSymbols = {
    "@youwol/http-primitives": {
        "apiKey": "02",
        "exportedSymbol": "@youwol/http-primitives"
    },
    "rxjs": {
        "apiKey": "7",
        "exportedSymbol": "rxjs"
    }
}

const mainEntry : {entryFile: string,loadDependencies:string[]} = {
    "entryFile": "./index.ts",
    "loadDependencies": [
        "@youwol/http-primitives",
        "rxjs"
    ]
}

const secondaryEntries : {[k:string]:{entryFile: string, name: string, loadDependencies:string[]}}= {}

const entries = {
     '@youwol/local-youwol-client': './index.ts',
    ...Object.values(secondaryEntries).reduce( (acc,e) => ({...acc, [`@youwol/local-youwol-client/${e.name}`]:e.entryFile}), {})
}
export const setup = {
    name:'@youwol/local-youwol-client',
        assetId:'QHlvdXdvbC9sb2NhbC15b3V3b2wtY2xpZW50',
    version:'0.2.2-wip',
    shortDescription:"Client for local py-youwol",
    developerDocumentation:'https://platform.youwol.com/applications/@youwol/cdn-explorer/latest?package=@youwol/local-youwol-client&tab=doc',
    npmPackage:'https://www.npmjs.com/package/@youwol/local-youwol-client',
    sourceGithub:'https://github.com/youwol/local-youwol-client',
    userGuide:'https://l.youwol.com/doc/@youwol/local-youwol-client',
    apiVersion:'02',
    runTimeDependencies,
    externals,
    exportedSymbols,
    entries,
    secondaryEntries,
    getDependencySymbolExported: (module:string) => {
        return `${exportedSymbols[module].exportedSymbol}_APIv${exportedSymbols[module].apiKey}`
    },

    installMainModule: ({cdnClient, installParameters}:{
        cdnClient:{install:(unknown) => Promise<WindowOrWorkerGlobalScope>},
        installParameters?
    }) => {
        const parameters = installParameters || {}
        const scripts = parameters.scripts || []
        const modules = [
            ...(parameters.modules || []),
            ...mainEntry.loadDependencies.map( d => `${d}#${runTimeDependencies.externals[d]}`)
        ]
        return cdnClient.install({
            ...parameters,
            modules,
            scripts,
        }).then(() => {
            return window[`@youwol/local-youwol-client_APIv02`]
        })
    },
    installAuxiliaryModule: ({name, cdnClient, installParameters}:{
        name: string,
        cdnClient:{install:(unknown) => Promise<WindowOrWorkerGlobalScope>},
        installParameters?
    }) => {
        const entry = secondaryEntries[name]
        if(!entry){
            throw Error(`Can not find the secondary entry '${name}'. Referenced in template.py?`)
        }
        const parameters = installParameters || {}
        const scripts = [
            ...(parameters.scripts || []),
            `@youwol/local-youwol-client#0.2.2-wip~dist/@youwol/local-youwol-client/${entry.name}.js`
        ]
        const modules = [
            ...(parameters.modules || []),
            ...entry.loadDependencies.map( d => `${d}#${runTimeDependencies.externals[d]}`)
        ]
        return cdnClient.install({
            ...parameters,
            modules,
            scripts,
        }).then(() => {
            return window[`@youwol/local-youwol-client/${entry.name}_APIv02`]
        })
    },
    getCdnDependencies(name?: string){
        if(name && !secondaryEntries[name]){
            throw Error(`Can not find the secondary entry '${name}'. Referenced in template.py?`)
        }
        const deps = name ? secondaryEntries[name].loadDependencies : mainEntry.loadDependencies

        return deps.map( d => `${d}#${runTimeDependencies.externals[d]}`)
    }
}
