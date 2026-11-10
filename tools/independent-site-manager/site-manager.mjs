#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '# FLYENV-INDEPENDENT-SITE-MANAGER'
const args = process.argv.slice(2)
const command = args.shift() || 'help'
const options = {}
for (let i = 0; i < args.length; i++) {
  const key = args[i]
  if (!key.startsWith('--')) throw new Error('Unexpected argument: ' + key)
  options[key.slice(2)] = args[++i]
}
const dataFile = path.resolve(options.data || './flyenv-sites.json')
const nginxOut = options['nginx-out'] ? path.resolve(options['nginx-out']) : null
const apacheOut = options['apache-out'] ? path.resolve(options['apache-out']) : null

function load() {
  if (!fs.existsSync(dataFile)) return []
  const value = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  if (!Array.isArray(value)) throw new Error('Data file must contain a JSON array')
  return value
}
function save(sites) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true })
  const tmp = dataFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(sites, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, dataFile)
}
function required(name) {
  if (!options[name]) throw new Error('Missing required option --' + name)
  return options[name]
}
function port(value, name) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Invalid --' + name + ' port')
  return n
}
function safeId(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}
function validateSite(site, sites) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(site.domain)) throw new Error('Invalid domain: ' + site.domain)
  for (const alias of site.aliases) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(alias)) throw new Error('Invalid alias: ' + alias)
  }
  if (!fs.existsSync(site.root) || !fs.statSync(site.root).isDirectory()) throw new Error('Document root does not exist: ' + site.root)
  if (!!site.cert !== !!site.key) throw new Error('Both --cert and --key are required for HTTPS')
  const names = [site.domain, ...site.aliases].map(x => x.toLowerCase())
  for (const other of sites) {
    const otherNames = [other.domain, ...(other.aliases || [])].map(x => x.toLowerCase())
    if (names.some(x => otherNames.includes(x))) throw new Error('Domain already assigned: ' + site.domain)
    for (const field of ['port', 'sslPort']) {
      if (site[field] && other[field] === site[field]) throw new Error('Port already assigned: ' + site[field])
    }
  }
}
function quotePath(value) {
  return '"' + value.replace(/\\/g, '/').replace(/"/g, '\\"') + '"'
}
function nginxConfig(site) {
  const lines = [MARKER, '# site: ' + site.id, 'server {', '    listen ' + site.port + ';']
  if (site.sslPort) lines.push('    listen ' + site.sslPort + ' ssl;')
  lines.push('    server_name ' + [site.domain, ...site.aliases].join(' ') + ';',
    '    root ' + quotePath(site.root) + ';', '    index index.php index.html index.htm;',
    '    location / {', '        try_files $uri $uri/ /index.php?$query_string;', '    }')
  if (site.phpFpm) lines.push('    location ~ \\.php$ {', '        try_files $uri =404;', '        include fastcgi_params;',
    '        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;', '        fastcgi_pass ' + site.phpFpm + ';', '    }')
  if (site.sslPort) lines.push('    ssl_certificate ' + quotePath(site.cert) + ';', '    ssl_certificate_key ' + quotePath(site.key) + ';')
  lines.push('}')
  return lines.join('\n') + '\n'
}
function apacheConfig(site) {
  const root = quotePath(site.root)
  function vhost(listenPort, ssl) {
    if (!listenPort) return ''
    const lines = [MARKER, '# site: ' + site.id, '<VirtualHost *:' + listenPort + '>', '    ServerName ' + site.domain]
    for (const alias of site.aliases) lines.push('    ServerAlias ' + alias)
    lines.push('    DocumentRoot ' + root, '    <Directory ' + root + '>', '        Options FollowSymLinks',
      '        AllowOverride All', '        Require all granted', '    </Directory>')
    if (site.phpFpm) lines.push('    <FilesMatch "\\\\.php$">', '        SetHandler "proxy:fcgi://' + site.phpFpm + '"', '    </FilesMatch>')
    if (ssl) lines.push('    SSLEngine on', '    SSLCertificateFile ' + quotePath(site.cert), '    SSLCertificateKeyFile ' + quotePath(site.key))
    lines.push('</VirtualHost>')
    return lines.join('\n')
  }
  return [vhost(site.port, false), vhost(site.sslPort, true)].filter(Boolean).join('\n\n') + '\n'
}
function writeGenerated(dir, render, sites) {
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.conf')) continue
    const file = path.join(dir, entry.name)
    if (fs.readFileSync(file, 'utf8').includes(MARKER)) fs.unlinkSync(file)
  }
  for (const site of sites) {
    fs.writeFileSync(path.join(dir, 'flyenv-independent-' + site.id + '.conf'), render(site), 'utf8')
  }
}
function generate(sites) {
  writeGenerated(nginxOut, nginxConfig, sites)
  writeGenerated(apacheOut, apacheConfig, sites)
  console.log('Generated ' + sites.length + ' site(s).')
}
try {
  const sites = load()
  if (command === 'add') {
    const domain = required('domain').trim()
    const site = {
      id: safeId(options.id || domain), domain,
      aliases: (options.aliases || '').split(',').map(x => x.trim()).filter(Boolean),
      root: path.resolve(required('root')), port: port(options.port || '8080', 'port'),
      sslPort: port(options['ssl-port'], 'ssl-port'),
      cert: options.cert ? path.resolve(options.cert) : '',
      key: options.key ? path.resolve(options.key) : '',
      phpFpm: options['php-fpm'] || ''
    }
    validateSite(site, sites)
    if (sites.some(x => x.id === site.id)) throw new Error('Site id already exists: ' + site.id)
    sites.push(site)
    save(sites)
    generate(sites)
    console.log('Added: ' + site.domain)
  } else if (command === 'remove') {
    const id = required('id')
    const next = sites.filter(x => x.id !== id)
    if (next.length === sites.length) throw new Error('Site not found: ' + id)
    save(next)
    generate(next)
    console.log('Removed: ' + id)
  } else if (command === 'list') {
    console.table(sites.map(({ id, domain, root, port, sslPort }) => ({ id, domain, root, port, sslPort: sslPort || '' })))
  } else if (command === 'generate') {
    generate(sites)
  } else {
    console.log('Independent Nginx + Apache site manager\nCommands: add, remove, list, generate\nAdd options: --domain --root [--aliases] [--port] [--ssl-port --cert --key] [--php-fpm]\nGlobal options: --data --nginx-out --apache-out')
  }
} catch (error) {
  console.error('Error: ' + error.message)
  process.exitCode = 1
}
