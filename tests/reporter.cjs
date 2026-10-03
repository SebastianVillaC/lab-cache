const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

class EvidenciaReporter {
  onRunComplete(_contexts, results) {
    const report = {
      fecha: new Date().toISOString(),
      resultado: results.numFailedTests === 0 && results.numFailedTestSuites === 0 ? 'APROBADO' : 'FALLIDO',
      resumen: {
        suites: results.numTotalTestSuites,
        suitesPasadas: results.numPassedTestSuites,
        suitesFallidas: results.numFailedTestSuites,
        pruebas: results.numTotalTests,
        pruebasPasadas: results.numPassedTests,
        pruebasFallidas: results.numFailedTests,
        duracionMs: results.startTime ? Date.now() - results.startTime : null,
      },
      suites: results.testResults.map((suite) => ({
        archivo: suite.name || suite.testFilePath,
        resultado: suite.status,
        pruebas: suite.testResults.map((test) => ({
          nombre: test.fullName,
          resultado: test.status,
          duracionMs: test.duration ?? null,
          errores: test.failureMessages,
        })),
      })),
    };
    const destination = resolve('docs/evidencias/reporte-jest.json');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Reporte JSON: ${destination}`);
  }
}

module.exports = EvidenciaReporter;
