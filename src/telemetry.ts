import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
	resource: new Resource({
		[SemanticResourceAttributes.SERVICE_NAME]: 'TyperestJS',
		[SemanticResourceAttributes.SERVICE_VERSION]: '1.0',
	}),
	// traceExporter: new ConsoleSpanExporter(),
	traceExporter: new OTLPTraceExporter({
		url: 'https://tempo-prod-10-prod-eu-west-2.grafana.net/tempo',
		timeoutMillis: 5000,
		headers: {
			//'726123:glc_eyJvIjoiNzU5MjAyIiwibiI6InN0YWNrLTc3NDAyMy1odC1yZWFkLXRyYWNlcyIsImsiOiIxWTRyMGs3UjRXM2QxZDgycm04WlBDdWciLCJtIjp7InIiOiJwcm9kLWV1LXdlc3QtMiJ9fQ=='
			Authorization:
				'Basic NzI2MTIzOmdsY19leUp2SWpvaU56VTVNakF5SWl3aWJpSTZJbk4wWVdOckxUYzNOREF5TXkxb2RDMXlaV0ZrTFhSeVlXTmxjeUlzSW1zaU9pSXhXVFJ5TUdzM1VqUlhNMlF4WkRneWNtMDRXbEJEZFdjaUxDSnRJanA3SW5JaU9pSndjbTlrTFdWMUxYZGxjM1F0TWlKOWZRPT0=',
		},
	}),
	// metricReader: new PeriodicExportingMetricReader({
	// 	exportIntervalMillis: 10_000,
	// 	exporter: new ConsoleMetricExporter(),
	// }),
})

sdk.start()
