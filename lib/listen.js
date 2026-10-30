async function listenAvailable(server, { port = 4173, fallback = true, attempts = 20, onRetry = () => {} } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
  for (let attempt = 0; attempt < attempts && port <= 65535; attempt++, port++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = error => { server.removeListener('listening', onListening); reject(error); };
        const onListening = () => { server.removeListener('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (!fallback || attempt === attempts - 1 || port === 65535) {
        error.message = `Port ${port} is already in use. Stop the earlier server or set PORT to another number.`;
        throw error;
      }
      onRetry(port, port + 1);
    }
  }
}

module.exports = { listenAvailable };
