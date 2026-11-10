# Independent Nginx + Apache Site Manager

A standalone companion utility for managing an independent collection of local virtual hosts. It does not call FlyEnv's Host API, read or modify FlyEnv host.json, or change FlyEnv licensing code.

## Requirements
- Node.js 18+
- Nginx and/or Apache configured to include the generated configuration directory
- Optional PHP-FPM endpoint for PHP projects

## Usage (PowerShell)
```powershell
node .\site-manager.mjs add --domain demo.test --root D:\Sites\demo\public --port 8080 --nginx-out D:\FlyEnvData\independent\nginx --apache-out D:\FlyEnvData\independent\apache
node .\site-manager.mjs add --domain shop.test --aliases www.shop.test --root D:\Sites\shop\public --port 8081 --php-fpm 127.0.0.1:9000 --nginx-out D:\FlyEnvData\independent\nginx --apache-out D:\FlyEnvData\independent\apache
node .\site-manager.mjs add --domain secure.test --root D:\Sites\secure\public --port 8082 --ssl-port 8445 --cert D:\certs\secure.crt --key D:\certs\secure.key --nginx-out D:\FlyEnvData\independent\nginx --apache-out D:\FlyEnvData\independent\apache
node .\site-manager.mjs list
node .\site-manager.mjs remove --id demo-test
node .\site-manager.mjs generate
```

The data file defaults to flyenv-sites.json in the current working directory. Pass --data to store it elsewhere.

## Integration boundaries
- Configure Nginx include and Apache IncludeOptional directives to load the generated directories. Review generated files and confirm the paths are not already managed by FlyEnv.
- This utility only generates virtual-host configuration files. It does not start, stop, reload, or modify either server's main configuration.
- Add domains to the system hosts file yourself or use your existing trusted hosts-file manager. The utility does not elevate privileges or edit system hosts.
- PHP-FPM must already be running and reachable at the endpoint passed to --php-fpm.
- Domain and port uniqueness is checked within this independent data set only; conflicts with unrelated applications or sites managed elsewhere cannot be detected.
- Back up server configuration before adding include directives.