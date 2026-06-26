'use client'
import { useState, useEffect } from 'react'
import { Connection, ConnectionType } from '@/lib/types'
import { formatDateTime, connectionIcons } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import ConnectionExclusionsPanel from './ConnectionExclusionsPanel'
import { apiFetch } from '@/lib/apiFetch'

/* ─── localStorage persistence for edge deployments ─── */
const LS_KEY = 'qualix_connections'

interface TestStep { label: string; status: 'ok' | 'fail' | 'skip'; detail: string }
interface TestResult {
  success: boolean; status: string; steps: TestStep[]
  errorCode?: string; errorMessage?: string; suggestion?: string; latencyMs?: number
}

function TestResultModal({ result, connName, onClose }: { result: TestResult; connName: string; onClose: () => void }) {
  const stepIcon = { ok: '✓', fail: '✗', skip: '⊘' }
  const stepColor = { ok: 'var(--status-ok-text)', fail: 'var(--status-error-text)', skip: 'var(--text-muted)' }
  const stepBg   = { ok: 'var(--status-ok-bg)', fail: 'var(--status-error-bg)', skip: 'var(--surface-muted)' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, backdropFilter:'blur(4px)' }}>
      <div style={{ background:'var(--surface)', borderRadius:'16px', width:'520px', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{
            width:'40px', height:'40px', borderRadius:'12px', flexShrink:0,
            background: result.success ? '#dcfce7' : '#fee2e2',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px'
          }}>{result.success ? '✅' : '❌'}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:'16px', color:'var(--foreground)' }}>
              {result.success ? 'Connection Successful' : 'Connection Failed'}
            </div>
            <div style={{ fontSize:'12.5px', color:'var(--text-secondary)', marginTop:'2px' }}>{connName}</div>
          </div>
          <button onClick={onClose} style={{ background:'var(--surface-muted)', border:'1px solid var(--border)', width:'30px', height:'30px', borderRadius:'8px', cursor:'pointer', color:'var(--text-secondary)', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Steps */}
          <div>
            <div style={{ fontSize:'11.5px', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.06em', marginBottom:'10px' }}>DIAGNOSTIC STEPS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {result.steps.map((step, i) => (
                <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'10px 12px', borderRadius:'8px', background:'var(--surface-muted)', border:'1px solid var(--border)' }}>
                  <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:stepBg[step.status], color:stepColor[step.status], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, flexShrink:0, marginTop:'1px' }}>
                    {stepIcon[step.status]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'var(--foreground)', marginBottom:'2px' }}>{step.label}</div>
                    <div style={{ fontSize:'12px', color: step.status === 'fail' ? 'var(--status-error-text)' : 'var(--text-secondary)' }}>{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error details */}
          {!result.success && result.errorMessage && (
            <div style={{ background:'var(--status-warn-bg)', border:'1px solid #fdba74', borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ fontSize:'12px', color:'var(--status-warn-text)', fontWeight:600, marginBottom:'6px', display:'flex', alignItems:'center', gap:'6px' }}>
                <span>⚠</span> Error Details {result.errorCode && <code style={{ background:'var(--surface-muted)', padding:'1px 6px', borderRadius:'4px', fontSize:'11px' }}>{result.errorCode}</code>}
              </div>
              <div style={{ fontSize:'13px', color:'var(--status-warn-text)', lineHeight:'1.5' }}>{result.errorMessage}</div>
            </div>
          )}

          {/* Suggestion */}
          {result.suggestion && (
            <div style={{ background:'var(--status-info-bg)', border:'1px solid #93c5fd', borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ fontSize:'12px', color:'var(--status-info-text)', fontWeight:600, marginBottom:'6px' }}>💡 How to fix this</div>
              <div style={{ fontSize:'13px', color:'var(--status-info-text)', lineHeight:'1.5' }}>{result.suggestion}</div>
            </div>
          )}

          {/* Latency */}
          {result.success && result.latencyMs && (
            <div style={{ background:'var(--status-ok-bg)', border:'1px solid #86efac', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'20px' }}>🚀</span>
              <div style={{ fontSize:'13px', color:'var(--status-ok-text)' }}>
                Connection verified in <strong>{result.latencyMs}ms</strong>. Status updated to <strong>Active</strong>.
              </div>
            </div>
          )}

          <button onClick={onClose} style={{ width:'100%', padding:'11px', borderRadius:'8px', border:'1px solid var(--border)', background: result.success ? '#2563eb' : 'var(--surface)', color: result.success ? '#fff' : 'var(--text-secondary)', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            {result.success ? '✓ Done' : 'Close & Edit Connection'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CONNECTION_TYPES: { value: ConnectionType; label: string; color: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL',      color: '#336791' },
  { value: 'mysql',      label: 'MySQL',            color: '#00758f' },
  { value: 'snowflake',  label: 'Snowflake',        color: '#29B5E8' },
  { value: 'bigquery',   label: 'BigQuery',         color: '#4285F4' },
  { value: 'redshift',   label: 'Redshift',         color: '#8C4FFF' },
  { value: 'mongodb',    label: 'MongoDB',          color: '#13AA52' },
  { value: 'csv',        label: 'CSV / File',       color: '#64748b' },
  { value: 'api',        label: 'REST API',         color: '#f59e0b' },
  { value: 'databricks', label: 'Databricks',       color: '#FF3621' },
  { value: 'sqlserver',  label: 'SQL Server',       color: '#CC2927' },
  { value: 'oracle',     label: 'Oracle DB',        color: '#F80000' },
  { value: 'db2',        label: 'IBM Db2',          color: '#006699' },
  { value: 'saphana',    label: 'SAP HANA',         color: '#008FD3' },
  { value: 'hive',       label: 'Apache Hive',      color: '#FDEE21' },
  { value: 'synapse',    label: 'Azure Synapse',    color: '#0078D4' },
  { value: 'teradata',   label: 'Teradata',         color: '#F37440' },
  { value: 'tableau',    label: 'Tableau',          color: '#E97627' },
  { value: 'powerbi',    label: 'Power BI',         color: '#F2C811' },
  { value: 'looker',     label: 'Looker',           color: '#4285F4' },
  { value: 's3',         label: 'Amazon S3',        color: '#FF9900' },
  { value: 'gcs',        label: 'Google GCS',       color: '#4285F4' },
  { value: 'azureblob',  label: 'Azure Blob',       color: '#0078D4' },
  { value: 'kafka',      label: 'Apache Kafka',     color: '#231F20' },
  { value: 'kinesis',    label: 'Amazon Kinesis',   color: '#FF9900' },
  { value: 'dbt',        label: 'dbt',              color: '#FF694B' },
  { value: 'fivetran',   label: 'Fivetran',         color: '#0073E6' },
  { value: 'airbyte',    label: 'Airbyte',          color: '#615EFF' },
]

const CATEGORIES = [
  { id: 'databases',  label: 'Databases',  emoji: '🗄️', types: ['postgresql','mysql','mongodb','oracle','sqlserver','db2','saphana','hive'] },
  { id: 'warehouses', label: 'Warehouses', emoji: '☁️', types: ['snowflake','bigquery','redshift','databricks','synapse','teradata'] },
  { id: 'bi',         label: 'BI Tools',   emoji: '📈', types: ['tableau','powerbi','looker'] },
  { id: 'storage',    label: 'Storage',    emoji: '🪣', types: ['s3','gcs','azureblob','csv','api'] },
  { id: 'streaming',  label: 'Streaming',  emoji: '⚡', types: ['kafka','kinesis'] },
  { id: 'transform',  label: 'Transform',  emoji: '🔄', types: ['dbt','fivetran','airbyte'] },
] as const

interface FieldDef {
  key: string; label: string; placeholder: string
  required?: boolean; type?: string; full?: boolean; hint?: string
}

const typeFields: Record<ConnectionType, FieldDef[]> = {
  postgresql: [
    { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
    { key: 'port', label: 'Port', placeholder: '5432', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'my_database', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'public' },
    { key: 'username', label: 'Username', placeholder: 'db_user' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  mysql: [
    { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
    { key: 'port', label: 'Port', placeholder: '3306', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'my_database', required: true },
    { key: 'username', label: 'Username', placeholder: 'root' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  snowflake: [
    { key: 'account', label: 'Account Identifier', placeholder: 'abc12345.us-east-1', required: true, full: true, hint: 'Found in your Snowflake URL: <account>.snowflakecomputing.com' },
    { key: 'warehouse', label: 'Warehouse', placeholder: 'COMPUTE_WH', required: true },
    { key: 'role', label: 'Role', placeholder: 'SYSADMIN' },
    { key: 'username', label: 'Username', placeholder: 'SNOWFLAKE_USER', required: true },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password', required: true },
  ],
  bigquery: [
    { key: 'project', label: 'Project ID', placeholder: 'my-gcp-project-123', required: true, full: true },
    { key: 'database', label: 'Dataset', placeholder: 'my_dataset' },
    { key: 'keyFile', label: 'Service Account Key Path', placeholder: '/path/to/service-account.json', full: true, hint: 'Or set GOOGLE_APPLICATION_CREDENTIALS env variable' },
  ],
  redshift: [
    { key: 'host', label: 'Cluster Endpoint', placeholder: 'cluster.abc123.us-east-1.redshift.amazonaws.com', required: true, full: true },
    { key: 'port', label: 'Port', placeholder: '5439', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'dev', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'public' },
    { key: 'username', label: 'Username', placeholder: 'awsuser' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  mongodb: [
    { key: 'connectionString', label: 'Connection String', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/db', required: true, full: true, hint: 'Full MongoDB URI — include username & password directly in the URI, or use the fields below' },
    { key: 'database', label: 'Database Name', placeholder: 'my_database', required: true },
    { key: 'username', label: 'Username (optional)', placeholder: 'mongo_user' },
    { key: 'password', label: 'Password (optional)', placeholder: '••••••••', type: 'password' },
  ],
  csv: [
    { key: 'filePath', label: 'File Path or URL', placeholder: '/data/file.csv  or  https://example.com/data.csv', required: true, full: true },
    { key: 'delimiter', label: 'Delimiter', placeholder: ', (comma)' },
    { key: 'schema', label: 'Sheet / Table Name', placeholder: 'Sheet1' },
    { key: 'username', label: 'Username (if auth required)', placeholder: 'user' },
    { key: 'password', label: 'Password (if auth required)', placeholder: '••••••••', type: 'password' },
  ],
  api: [
    { key: 'host', label: 'Base URL', placeholder: 'https://api.example.com', required: true, full: true },
    { key: 'schema', label: 'Auth Type', placeholder: 'bearer | api-key | basic | none' },
    { key: 'database', label: 'Data Endpoint', placeholder: '/v1/data' },
    { key: 'username', label: 'API Key / Username', placeholder: 'sk-... or api_user' },
    { key: 'password', label: 'API Secret / Password', placeholder: '••••••••', type: 'password' },
  ],
  oracle: [
    { key: 'host',     label: 'Host',         placeholder: 'db.example.com',     required: true },
    { key: 'port',     label: 'Port',         placeholder: '1521',               type: 'number' },
    { key: 'database', label: 'Service Name', placeholder: 'ORCL',               required: true },
    { key: 'schema',   label: 'Schema',       placeholder: 'SCOTT' },
    { key: 'username', label: 'Username',     placeholder: 'oracle_user' },
    { key: 'password', label: 'Password',     placeholder: '••••••••',           type: 'password' },
  ],
  sqlserver: [
    { key: 'host',     label: 'Host',          placeholder: 'db.example.com',    required: true },
    { key: 'port',     label: 'Port',          placeholder: '1433',              type: 'number' },
    { key: 'database', label: 'Database',      placeholder: 'my_database',       required: true },
    { key: 'schema',   label: 'Instance Name', placeholder: 'MSSQLSERVER' },
    { key: 'username', label: 'Username',      placeholder: 'sa' },
    { key: 'password', label: 'Password',      placeholder: '••••••••',          type: 'password' },
  ],
  db2: [
    { key: 'host',     label: 'Host',     placeholder: 'db.example.com', required: true },
    { key: 'port',     label: 'Port',     placeholder: '50000',          type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'SAMPLE',         required: true },
    { key: 'username', label: 'Username', placeholder: 'db2inst1' },
    { key: 'password', label: 'Password', placeholder: '••••••••',       type: 'password' },
  ],
  saphana: [
    { key: 'host',     label: 'Host',            placeholder: 'hana.example.com', required: true },
    { key: 'port',     label: 'Port',            placeholder: '39015',            type: 'number' },
    { key: 'schema',   label: 'Instance Number', placeholder: '00' },
    { key: 'username', label: 'Username',        placeholder: 'SYSTEM' },
    { key: 'password', label: 'Password',        placeholder: '••••••••',         type: 'password' },
  ],
  hive: [
    { key: 'host',     label: 'Host',       placeholder: 'hive.example.com',    required: true },
    { key: 'port',     label: 'Port',       placeholder: '10000',               type: 'number' },
    { key: 'database', label: 'Database',   placeholder: 'default' },
    { key: 'schema',   label: 'Auth Type',  placeholder: 'NONE | NOSASL | PLAIN' },
    { key: 'username', label: 'Username',   placeholder: 'hive_user' },
    { key: 'password', label: 'Password',   placeholder: '••••••••',            type: 'password' },
  ],
  databricks: [
    { key: 'host',     label: 'Workspace URL', placeholder: 'adb-xxxx.azuredatabricks.net',  required: true, full: true, hint: 'Found in your Databricks workspace URL' },
    { key: 'schema',   label: 'HTTP Path',     placeholder: '/sql/1.0/warehouses/xxxx',      required: true, full: true, hint: 'Found under SQL Warehouses → Connection Details' },
    { key: 'password', label: 'Access Token',  placeholder: 'dapixxxxxxxxxxxxxxxx',          required: true, full: true, type: 'password', hint: 'Generate in User Settings → Developer → Access tokens' },
    { key: 'database', label: 'Catalog',       placeholder: 'hive_metastore' },
    { key: 'username', label: 'Schema',        placeholder: 'default' },
  ],
  synapse: [
    { key: 'host',     label: 'Workspace URL', placeholder: 'myworkspace.sql.azuresynapse.net', required: true, full: true },
    { key: 'database', label: 'Pool Name',     placeholder: 'mySqlPool',                        required: true },
    { key: 'username', label: 'Username',      placeholder: 'sqladminuser' },
    { key: 'password', label: 'Password',      placeholder: '••••••••',                         type: 'password' },
  ],
  teradata: [
    { key: 'host',     label: 'Host',     placeholder: 'td.example.com', required: true },
    { key: 'database', label: 'Database', placeholder: 'my_database' },
    { key: 'username', label: 'Username', placeholder: 'dbc' },
    { key: 'password', label: 'Password', placeholder: '••••••••',       type: 'password' },
  ],
  tableau: [
    { key: 'host',     label: 'Server URL',            placeholder: 'https://tableau.example.com', required: true, full: true },
    { key: 'database', label: 'Site ID',               placeholder: 'my-site (blank for default)' },
    { key: 'username', label: 'Token Name',            placeholder: 'my-pat-name',                 required: true },
    { key: 'password', label: 'Personal Access Token', placeholder: 'xxxxxxxxxxxxxxxxxxxx',         required: true, type: 'password' },
  ],
  powerbi: [
    { key: 'schema',   label: 'Tenant ID',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', required: true, full: true },
    { key: 'username', label: 'Client ID',     placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', required: true },
    { key: 'password', label: 'Client Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxx',                 required: true, type: 'password' },
    { key: 'database', label: 'Workspace ID',  placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  ],
  looker: [
    { key: 'host',     label: 'Host',          placeholder: 'your-company.looker.com', required: true },
    { key: 'port',     label: 'Port',          placeholder: '19999',                   type: 'number' },
    { key: 'username', label: 'Client ID',     placeholder: 'abc123',                  required: true },
    { key: 'password', label: 'Client Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxx',    required: true, type: 'password' },
  ],
  s3: [
    { key: 'database', label: 'Bucket',           placeholder: 'my-data-bucket',         required: true },
    { key: 'schema',   label: 'Region',           placeholder: 'us-east-1',              required: true },
    { key: 'username', label: 'Access Key ID',    placeholder: 'AKIAIOSFODNN7EXAMPLE',   required: true },
    { key: 'password', label: 'Secret Access Key',placeholder: 'wJalrXUtnFEMI/K7MDENG', required: true, type: 'password' },
    { key: 'filePath', label: 'Prefix (optional)',placeholder: 'data/raw/' },
  ],
  gcs: [
    { key: 'project',  label: 'Project ID',              placeholder: 'my-gcp-project-123', required: true },
    { key: 'database', label: 'Bucket',                  placeholder: 'my-data-bucket',     required: true },
    { key: 'keyFile',  label: 'Service Account Key Path',placeholder: '/path/to/key.json',  full: true, hint: 'Or set GOOGLE_APPLICATION_CREDENTIALS env variable' },
  ],
  azureblob: [
    { key: 'username', label: 'Account Name',             placeholder: 'mystorageaccount',                        required: true },
    { key: 'database', label: 'Container',                placeholder: 'my-container',                            required: true },
    { key: 'password', label: 'Account Key or SAS Token', placeholder: 'DefaultEndpointsProtocol=https...',       required: true, type: 'password', full: true },
  ],
  kafka: [
    { key: 'host',     label: 'Brokers',          placeholder: 'broker1:9092,broker2:9092', required: true, full: true },
    { key: 'database', label: 'Topic',            placeholder: 'my-topic' },
    { key: 'schema',   label: 'Consumer Group',   placeholder: 'qualix-consumer' },
    { key: 'filePath', label: 'Security Protocol',placeholder: 'PLAINTEXT | SSL | SASL_SSL' },
    { key: 'username', label: 'Username',         placeholder: 'kafka_user' },
    { key: 'password', label: 'Password',         placeholder: '••••••••', type: 'password' },
  ],
  kinesis: [
    { key: 'database', label: 'Stream Name',      placeholder: 'my-data-stream',          required: true },
    { key: 'schema',   label: 'Region',           placeholder: 'us-east-1',               required: true },
    { key: 'username', label: 'Access Key ID',    placeholder: 'AKIAIOSFODNN7EXAMPLE',    required: true },
    { key: 'password', label: 'Secret Access Key',placeholder: 'wJalrXUtnFEMI/K7MDENG',  required: true, type: 'password' },
  ],
  dbt: [
    { key: 'schema',   label: 'Adapter Type', placeholder: 'snowflake | bigquery | redshift | postgres', full: true },
    { key: 'database', label: 'Project Name', placeholder: 'my_dbt_project',   required: true },
    { key: 'password', label: 'API Key',      placeholder: 'dbt Cloud API key', type: 'password', hint: 'dbt Cloud: Settings → API tokens. Leave blank for dbt Core.' },
    { key: 'username', label: 'Job ID',       placeholder: '12345 (dbt Cloud job)' },
  ],
  fivetran: [
    { key: 'username', label: 'API Key',      placeholder: 'your_api_key',    required: true },
    { key: 'password', label: 'API Secret',   placeholder: 'your_api_secret', required: true, type: 'password' },
    { key: 'database', label: 'Connector ID', placeholder: 'connector_id' },
  ],
  airbyte: [
    { key: 'host',     label: 'Host URL',      placeholder: 'http://localhost:8000',                  required: true, full: true },
    { key: 'database', label: 'Connection ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'username', label: 'Username',      placeholder: 'airbyte' },
    { key: 'password', label: 'Password',      placeholder: '••••••••',                               type: 'password' },
  ],
}

const typeInfo: Record<ConnectionType, { desc: string; docUrl: string }> = {
  postgresql:  { desc: 'Open-source relational database',                  docUrl: '#' },
  mysql:       { desc: 'Popular open-source RDBMS',                        docUrl: '#' },
  snowflake:   { desc: 'Cloud data warehouse platform',                    docUrl: '#' },
  bigquery:    { desc: 'Google serverless data warehouse',                 docUrl: '#' },
  redshift:    { desc: 'AWS cloud data warehouse',                         docUrl: '#' },
  mongodb:     { desc: 'Document-oriented NoSQL database',                 docUrl: '#' },
  csv:         { desc: 'Flat file (CSV, TSV, Excel)',                      docUrl: '#' },
  api:         { desc: 'REST API data source',                             docUrl: '#' },
  oracle:      { desc: 'Enterprise relational database by Oracle',         docUrl: '#' },
  sqlserver:   { desc: 'Microsoft SQL Server / Azure SQL Database',        docUrl: '#' },
  db2:         { desc: 'IBM Db2 enterprise database',                      docUrl: '#' },
  saphana:     { desc: 'SAP HANA in-memory database',                     docUrl: '#' },
  hive:        { desc: 'Apache Hive data warehouse on Hadoop',             docUrl: '#' },
  databricks:  { desc: 'Databricks Lakehouse — Delta Lake SQL Warehouse',  docUrl: '#' },
  synapse:     { desc: 'Azure Synapse Analytics',                          docUrl: '#' },
  teradata:    { desc: 'Teradata enterprise data warehouse',               docUrl: '#' },
  tableau:     { desc: 'Tableau Server or Tableau Cloud (metadata)',       docUrl: '#' },
  powerbi:     { desc: 'Microsoft Power BI workspace connector',           docUrl: '#' },
  looker:      { desc: 'Looker (Google) BI platform',                     docUrl: '#' },
  s3:          { desc: 'Amazon S3 object storage',                        docUrl: '#' },
  gcs:         { desc: 'Google Cloud Storage bucket',                     docUrl: '#' },
  azureblob:   { desc: 'Azure Blob Storage container',                    docUrl: '#' },
  kafka:       { desc: 'Apache Kafka streaming platform',                 docUrl: '#' },
  kinesis:     { desc: 'Amazon Kinesis data stream',                      docUrl: '#' },
  dbt:         { desc: 'dbt transformation layer (Core or Cloud)',         docUrl: '#' },
  fivetran:    { desc: 'Fivetran automated data movement',                docUrl: '#' },
  airbyte:     { desc: 'Airbyte open-source data integration',            docUrl: '#' },
}

const statusBadge = {
  active: { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', dot: 'var(--status-ok-text)', label: 'Active' },
  inactive: { bg: 'var(--surface-muted)', color: 'var(--text-secondary)', dot: 'var(--text-muted)', label: 'Inactive' },
  error: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)', dot: 'var(--status-error-text)', label: 'Error' }
}

interface Props { initialConnections: Connection[] }

type FormState = Record<string, string> & { name: string; type: ConnectionType }

function getCategoryForType(type: string): string {
  return CATEGORIES.find(c => (c.types as readonly string[]).includes(type))?.id ?? 'databases'
}

function filterCount(conn: Connection): number {
  return conn.filterMode === 'include'
    ? (conn.includedDatabases?.length ?? 0) + (conn.includedSchemas?.length ?? 0)
    : (conn.excludedDatabases?.length ?? 0) + (conn.excludedSchemas?.length ?? 0)
}

export default function ConnectionsClient({ initialConnections }: Props) {
  const [connections, setConnections] = useState<Connection[]>(() => {
    if (typeof window === 'undefined') return initialConnections
    try {
      const raw = localStorage.getItem(LS_KEY)
      const stored: Connection[] = raw ? JSON.parse(raw) : []
      if (stored.length > 0) {
        const storedIds = new Set(stored.map(c => c.id))
        return [...stored, ...initialConnections.filter(c => !storedIds.has(c.id))]
      }
    } catch { /* ignore */ }
    return initialConnections
  })
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [exclusionsPanelConn, setExclusionsPanelConn] = useState<Connection | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({ name: '', type: 'postgresql' })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ result: TestResult; connName: string } | null>(null)
  const [activeCategory, setActiveCategory] = useState('databases')
  const [testingModal, setTestingModal] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const _router = useRouter()

  // On mount: reconcile localStorage against backend — drop connections
  // deleted from the backend and add any created outside this browser.
  useEffect(() => {
    apiFetch('/api/connections', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        if (!data) return
        const apiConns: Connection[] = Array.isArray(data) ? data : ((data as { connections?: Connection[] }).connections ?? [])
        if (apiConns.length === 0) return
        const apiIds = new Set(apiConns.map(c => c.id))
        setConnections(prev => {
          const kept = prev.filter(c => apiIds.has(c.id))
          const prevIds = new Set(prev.map(c => c.id))
          const added = apiConns.filter(c => !prevIds.has(c.id))
          return [...kept, ...added]
        })
      })
      .catch(() => {/* keep local state on network error */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist to localStorage whenever connections change + notify sidebar
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(connections))
      // Notify sidebar's connection selector to re-read
      window.dispatchEvent(new Event('qualix-connections-updated'))
    } catch { /* quota */ }
  }, [connections])

  const fields = typeFields[form.type] || []
  const connInfo = typeInfo[form.type]

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function resetForm() {
    setForm({ name: '', type: 'postgresql' })
    setEditingId(null)
    setShowModal(false)
    setActiveCategory('databases')
    setSaveError(null)
  }

  function openEdit(conn: Connection) {
    // Pre-fill form with all existing connection fields
    const filled: FormState = { name: conn.name, type: conn.type }
    const connRecord = conn as unknown as Record<string, unknown>
    typeFields[conn.type]?.forEach(f => {
      if (connRecord[f.key] !== undefined && connRecord[f.key] !== null) {
        filled[f.key] = String(connRecord[f.key])
      }
    })
    setForm(filled)
    setEditingId(conn.id)
    setShowModal(true)
    setActiveCategory(getCategoryForType(conn.type))
  }

  async function save() {
    if (!form.name) return
    setSaving(true)
    setSaveError(null)
    const payload: Record<string, unknown> = { ...form }
    if (form.port) payload.port = parseInt(form.port)

    try {
      if (editingId) {
        // UPDATE existing connection
        const res = await apiFetch('/api/connections', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setSaveError((data as { detail?: string }).detail || 'Failed to save connection')
          setSaving(false)
          return
        }
        const updated = await res.json()
        setConnections(prev => prev.map(c => c.id === editingId ? updated : c))
      } else {
        // CREATE new connection
        const res = await apiFetch('/api/connections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setSaveError((data as { detail?: string }).detail || 'Failed to save connection')
          setSaving(false)
          return
        }
        const newConn = await res.json()
        setConnections(prev => [...prev, newConn])
        resetForm()
        setSaving(false)
        // For Snowflake, immediately open the filter panel as a follow-up step
        if (newConn.type === 'snowflake') {
          setExclusionsPanelConn(newConn)
        }
        return
      }

      resetForm()
      setSaving(false)
    } catch {
      setSaveError('Network error — could not reach the server')
      setSaving(false)
    }
  }

  async function testConn(id: string, connName: string) {
    setTesting(id)
    try {
      // Send full connection data so the test endpoint doesn't depend on server-side store
      const conn = connections.find(c => c.id === id)
      const res = await apiFetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: id, connectionData: conn })
      })
      const result: TestResult = await res.json()
      // Update local connection status based on test result
      if (result.status) {
        setConnections(prev => prev.map(c =>
          c.id === id ? { ...c, status: result.status as Connection['status'], lastTested: new Date().toISOString() } : c
        ))
      }
      setTestResult({ result, connName })
    } catch (e: unknown) {
      setTestResult({
        result: {
          success: false, status: 'error',
          steps: [{ label: 'API call', status: 'fail', detail: (e as Error).message }],
          errorCode: 'CLIENT_ERROR',
          errorMessage: 'Could not reach the test endpoint.',
          suggestion: 'Make sure the dev server is running.'
        },
        connName
      })
    } finally {
      setTesting(null)
      // state is managed locally — no server refresh needed
    }
  }

  async function testInModal() {
    if (!form.name || !form.type) return
    setTestingModal(true)
    try {
      const res = await apiFetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: editingId || '__preview__', connectionData: { ...form, id: editingId || '__preview__', status: 'inactive', createdAt: new Date().toISOString() } })
      })
      if (!res.ok) throw new Error(`Test endpoint returned ${res.status}`)
      const result: TestResult = await res.json()
      setTestResult({ result, connName: form.name })
    } catch (e: unknown) {
      setTestResult({
        result: {
          success: false, status: 'error',
          steps: [{ label: 'API call', status: 'fail', detail: (e as Error).message }],
          errorCode: 'CLIENT_ERROR', errorMessage: 'Could not reach the test endpoint.',
          suggestion: 'Make sure the dev server is running.'
        },
        connName: form.name
      })
    } finally {
      setTestingModal(false)
    }
  }

  async function deleteConn(id: string) {
    if (!confirm('Delete this connection?')) return
    await fetch(`/api/connections?id=${id}`, { method: 'DELETE' })
    setConnections(prev => prev.filter(c => c.id !== id))
    // state is managed locally — no server refresh needed
  }

  const inp = (full?: boolean): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    fontSize: '13px', color: 'var(--foreground)', background: 'var(--surface-muted)', outline: 'none',
    gridColumn: full ? '1 / -1' : undefined
  })

  const selectedType = CONNECTION_TYPES.find(t => t.value === form.type)

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1200px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        Workspace · <span style={{ color: 'var(--text-secondary)' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Connections</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>
            {connections.length} data source{connections.length !== 1 ? 's' : ''} — {connections.filter(c => c.status === 'active').length} active
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          background: '#dbeafe', border: '1px solid #93c5fd', padding: '8px 16px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer'
        }}>+ Add Connection</button>
      </div>

      {/* Connection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
        {connections.map(conn => {
          const s = statusBadge[conn.status] ?? statusBadge.inactive
          const icon = connectionIcons[conn.type] || '🔌'
          const typeColor = CONNECTION_TYPES.find(t => t.value === conn.type)?.color || '#64748b'
          const fields = typeFields[conn.type] || []

          return (
            <div key={conn.id} style={{
              background: 'var(--surface)', borderRadius: '12px', padding: '20px',
              border: '1px solid var(--border)', transition: 'box-shadow 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: `${typeColor}18`, border: `1px solid ${typeColor}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
                  }}>{icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '14px' }}>{conn.name}</div>
                    <div style={{ color: typeColor, fontSize: '11.5px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {CONNECTION_TYPES.find(t => t.value === conn.type)?.label || conn.type}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 600 }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot }} />{s.label}
                </div>
              </div>

              {/* Type-specific details */}
              <div style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', border: '1px solid var(--border)' }}>
                {fields.filter(f => !['username', 'keyFile', 'connectionString'].includes(f.key)).slice(0, 3).map(f => {
                  const val = (conn as unknown as Record<string, unknown>)[f.key] as string | undefined
                  return val ? (
                    <div key={f.key} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-muted)', minWidth: '70px' }}>{f.label}:</span>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                    </div>
                  ) : null
                })}
                {conn.host && !fields.find(f => f.key === 'account') && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Host: </span>
                    <span style={{ fontWeight: 500 }}>{conn.host}{conn.port ? `:${conn.port}` : ''}</span>
                  </div>
                )}
                {conn.database && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Database: </span>
                    <span style={{ fontWeight: 500 }}>{conn.database}</span>
                  </div>
                )}
                {conn.lastTested && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Last tested: {formatDateTime(conn.lastTested)}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => testConn(conn.id, conn.name)} disabled={testing === conn.id} style={{
                  flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid var(--border)',
                  background: testing === conn.id ? 'var(--surface-muted)' : 'var(--surface)',
                  color: testing === conn.id ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 500, cursor: testing === conn.id ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}>
                  {testing === conn.id
                    ? <><span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⟳</span> Testing…</>
                    : '🔗 Test'}
                </button>
                <button onClick={() => openEdit(conn)} style={{
                  padding: '7px 12px', borderRadius: '7px', border: '1px solid #dbeafe',
                  background: 'var(--surface)', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontWeight: 500
                }}>✏️ Edit</button>
                {conn.type === 'snowflake' && (() => {
                  const count = filterCount(conn)
                  const isInclude = conn.filterMode === 'include'
                  const badgeBg = isInclude ? '#dbeafe' : '#fef3c7'
                  const badgeColor = isInclude ? '#2563eb' : '#d97706'
                  return (
                    <button onClick={() => setExclusionsPanelConn(conn)} aria-label={`Manage filters for ${conn.name}`} style={{
                      padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      ⚙ Filters
                      {count > 0 && (
                        <span aria-hidden="true" style={{ background: badgeBg, color: badgeColor, fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '10px', lineHeight: 1.4 }}>
                          {count} {isInclude ? 'included' : 'excluded'}
                        </span>
                      )}
                    </button>
                  )
                })()}
                <button onClick={() => deleteConn(conn.id)} style={{
                  padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--status-error-bg)',
                  background: 'var(--surface)', color: '#ef4444', fontSize: '12px', cursor: 'pointer'
                }}>🗑</button>
              </div>
            </div>
          )
        })}

        {connections.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: 'var(--surface)', borderRadius: '14px', border: '2px dashed var(--border)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔌</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>No connections yet</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>Add your first data source to start monitoring quality</div>
            <button onClick={() => setShowModal(true)} style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>+ Add Connection</button>
          </div>
        )}
      </div>

      {/* Test Result Modal */}
      {testResult && (
        <TestResultModal
          result={testResult.result}
          connName={testResult.connName}
          onClose={() => setTestResult(null)}
        />
      )}

      {/* Exclusions Panel */}
      {exclusionsPanelConn !== null && (
        <ConnectionExclusionsPanel
          connection={exclusionsPanelConn}
          onClose={() => setExclusionsPanelConn(null)}
          onSaved={(updated: Connection) => {
            setConnections(prev => prev.map(c => c.id === updated.id ? updated : c))
            setExclusionsPanelConn(null)
          }}
        />
      )}

      {/* Add Connection Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Modal Header */}
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>
                  {editingId ? '✏️ Edit Connection' : 'Add Connection'}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {editingId ? 'Update credentials or settings for this connection' : 'Connect a new data source to Qualix'}
                </div>
              </div>
              <button onClick={resetForm} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Connection name */}
              <div>
                <label style={lbl}>Connection Name *</label>
                <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Production Snowflake" style={inp()} />
              </div>

              {/* Type selector — locked when editing */}
              {editingId ? (
                <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{connectionIcons[form.type]}</span>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    <strong>{CONNECTION_TYPES.find(t => t.value === form.type)?.label}</strong> — type cannot be changed after creation
                  </div>
                </div>
              ) : (
                <div>
                  <label style={lbl}>Database Type *</label>

                  {/* Category tab segmented control */}
                  <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', background:'var(--surface-muted)', marginBottom:'8px' }}>
                    {CATEGORIES.map(cat => (
                      <button key={cat.id} onClick={() => {
                        setActiveCategory(cat.id)
                        const firstType = cat.types[0] as string
                        setField('type', firstType)
                      }}
                        style={{
                          flex:1, padding:'6px 2px', border:'none',
                          borderRight: cat.id === CATEGORIES[CATEGORIES.length - 1].id ? 'none' : '1px solid var(--border)',
                          background: activeCategory === cat.id ? '#dbeafe' : 'transparent',
                          color: activeCategory === cat.id ? '#2563eb' : 'var(--text-secondary)',
                          fontWeight: activeCategory === cat.id ? 700 : 500,
                          fontSize:'10.5px', cursor:'pointer', textAlign:'center', lineHeight:1.3
                        }}>
                        <div style={{ fontSize:'13px', marginBottom:'2px' }}>{cat.emoji}</div>
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Connector grid for active category */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px' }}>
                    {CATEGORIES.find(c => c.id === activeCategory)?.types.map(typeVal => {
                      const t = CONNECTION_TYPES.find(ct => ct.value === typeVal)
                      if (!t) return null
                      return (
                        <button key={t.value} onClick={() => setField('type', t.value)} style={{
                          padding:'8px 4px', borderRadius:'8px', border:'1px solid',
                          borderColor: form.type === t.value ? t.color : 'var(--border)',
                          background: form.type === t.value ? `${t.color}12` : 'var(--surface-muted)',
                          cursor:'pointer', textAlign:'center', transition:'all 0.15s'
                        }}>
                          <div style={{ fontSize:'18px', marginBottom:'3px' }}>{connectionIcons[t.value] || '🔌'}</div>
                          <div style={{ fontSize:'10px', fontWeight: form.type === t.value ? 700 : 500, color: form.type === t.value ? t.color : 'var(--text-secondary)' }}>{t.label}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Type info banner */}
              {connInfo && (
                <div style={{ background: 'var(--status-info-bg)', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{connectionIcons[form.type]}</span>
                  <div style={{ fontSize: '12.5px', color: 'var(--status-info-text)' }}>
                    <strong>{selectedType?.label}</strong> — {connInfo.desc}
                  </div>
                </div>
              )}

              {/* Dynamic fields per type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {fields.map(f => (
                  <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                    <label style={lbl}>
                      {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>
                    <input
                      value={form[f.key] || ''}
                      onChange={e => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      type={f.type || 'text'}
                      style={inp(f.full)}
                    />
                    {f.hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{f.hint}</div>}
                  </div>
                ))}
              </div>

              {/* Database Filters — only for Snowflake connections that have been saved */}
              {editingId && form.type === 'snowflake' && (() => {
                const conn = connections.find(c => c.id === editingId)
                if (!conn) return null
                const count = filterCount(conn)
                const isInclude = conn.filterMode === 'include'
                const accentColor = isInclude ? '#2563eb' : '#d97706'
                const accentBg    = isInclude ? '#dbeafe' : '#fef3c7'
                const accentBorder = isInclude ? '#93c5fd' : '#fde68a'
                return (
                  <div style={{ border: `1px solid ${count > 0 ? accentBorder : 'var(--border)'}`, borderRadius: '8px', padding: '12px 14px', background: count > 0 ? accentBg : 'var(--surface-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>Database Filters</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                          {count > 0
                            ? <><span style={{ color: accentColor, fontWeight: 600 }}>{count} item{count !== 1 ? 's' : ''}</span>{' · '}{isInclude ? 'Include only selected' : 'Exclude selected'}</>
                            : 'No filters — all databases and schemas are discovered'}
                        </div>
                      </div>
                      <button
                        onClick={() => setExclusionsPanelConn(conn)}
                        style={{ padding: '7px 12px', borderRadius: '7px', border: `1px solid ${accentColor}`, background: accentBg, color: accentColor, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Configure Filters
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* Save error */}
              {saveError && (
                <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 12px', color: 'var(--status-error-text)', fontSize: '12px' }}>
                  ⚠ {saveError}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
                <button onClick={resetForm} style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:500, cursor:'pointer' }}>Cancel</button>
                <button onClick={testInModal} disabled={testingModal || !form.name} style={{
                  flex:1.3, padding:'10px', borderRadius:'8px', border:'1px solid #93c5fd',
                  background: (!form.name || testingModal) ? 'var(--surface-muted)' : '#dbeafe',
                  color: (!form.name || testingModal) ? 'var(--text-muted)' : '#2563eb',
                  fontSize:'13px', fontWeight:600, cursor: (!form.name || testingModal) ? 'not-allowed' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:'6px'
                }}>
                  {testingModal
                    ? <><span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⟳</span> Testing…</>
                    : '🔗 Test Connection'}
                </button>
                <button onClick={save} disabled={saving || !form.name} style={{
                  flex:1.5, padding:'10px', borderRadius:'8px', border:'none', fontSize:'13px', fontWeight:600,
                  cursor: form.name ? 'pointer' : 'not-allowed',
                  background: form.name ? '#2563eb' : 'var(--surface-muted)',
                  color: form.name ? '#fff' : 'var(--text-muted)'
                }}>{saving ? '⏳ Saving...' : editingId ? '✓ Save Changes' : '+ Add Connection'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }
