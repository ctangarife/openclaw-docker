#!/usr/bin/env node
/**
 * Cliente ligero para obtener credenciales desde el credential service
 * Uso: node get-credential.cjs <provider_name>
 * Ejemplo: node get-credential.cjs minimax
 */

const net = require('net');
const fs = require('fs');

const SOCKET_PATH = '/tmp/credential.sock';
const PROVIDER = process.argv[2]?.toLowerCase();

if (!PROVIDER) {
  console.error('Uso: node get-credential.cjs <provider_name>');
  process.exit(1);
}

// Crear conexión al socket
const client = net.createConnection({ path: SOCKET_PATH });

let responseData = '';

client.on('connect', () => {
  // Enviar request
  const request = JSON.stringify({ action: 'get', key: PROVIDER }) + '\n';
  client.write(request);
});

client.on('data', (data) => {
  responseData += data.toString();
  try {
    const response = JSON.parse(responseData);
    if (response.success) {
      // Exportar como variable de entorno
      const varName = `${PROVIDER.toUpperCase()}_API_KEY`;
      console.log(`export ${varName}="${response.value}"`);
    } else {
      console.error(`# Error: ${response.error}`, true);
      process.exit(1);
    }
  } catch (err) {
    // Respuesta incompleta, esperar más datos
  }
});

client.on('end', () => {
  // Conexión cerrada
});

client.on('error', (err) => {
  console.error(`# Error conectando al credential service: ${err.message}`, true);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.error('# Error: Timeout esperando respuesta', true);
  process.exit(1);
}, 5000);
