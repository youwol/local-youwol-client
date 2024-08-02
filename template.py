import shutil
from pathlib import Path

from youwol.pipelines.pipeline_typescript_weback_npm import Template, PackageType, Dependencies, \
    RunTimeDeps, generate_template, Bundles, MainModule
from youwol.utils import parse_json

folder_path = Path(__file__).parent

pkg_json = parse_json(folder_path / 'package.json')


template = Template(
    path=folder_path,
    type=PackageType.LIBRARY,
    name=pkg_json['name'],
    version=pkg_json['version'],
    shortDescription=pkg_json['description'],
    author=pkg_json['author'],
    dependencies=Dependencies(
        runTime=RunTimeDeps(
            externals={
                "@youwol/http-primitives": "^0.2.3",
                "rxjs": "^7.5.6"
            }
        ),
        devTime={
            "jest-jasmine2": "^29.3.1",
            "@youwol/webpm-client": "^3.0.0",
            "@youwol/http-clients": "^3.0.0",
            # Auto upgrade (to 0.5.14) leads to test 'download-assets.test.ts#249' being broken.
            # Fix it for now.
            "adm-zip": "0.5.10"
        }
    ),
    bundles=Bundles(
          mainModule=MainModule(
              entryFile='./index.ts',
              loadDependencies=["@youwol/http-primitives", "rxjs"]
          )
        ),
    testConfig='https://github.com/youwol/local-youwol-client/blob/main/src/tests/yw_config',
    userGuide=True
    )

generate_template(template)
shutil.copyfile(
    src=folder_path / '.template' / 'src' / 'auto-generated.ts',
    dst=folder_path / 'src' / 'auto-generated.ts'
)
for file in [
    'README.md',
    '.npmignore',
    '.prettierignore',
    'LICENSE',
    'package.json',
    'tsconfig.json',
    'webpack.config.ts'
]:
    shutil.copyfile(
        src=folder_path / '.template' / file,
        dst=folder_path / file
    )
