import path from 'node:path'
import process from 'node:process'
import { replayVaultEpoch } from '../../server/vault/VaultRecovery.js'

const epochDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null
if (!epochDirectory) {
  console.error('Usage: npm run replay:vault -- <epoch-directory> [destination.sqlite3]')
  process.exitCode = 1
} else {
  const destinationPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(epochDirectory, `recovered_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite3`)
  try {
    const result = replayVaultEpoch(epochDirectory, destinationPath)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(`Vault replay failed: ${error.message}`)
    process.exitCode = 1
  }
}
