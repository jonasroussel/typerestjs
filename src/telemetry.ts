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
		headers: {},
	}),
	// metricReader: new PeriodicExportingMetricReader({
	// 	exportIntervalMillis: 10_000,
	// 	exporter: new ConsoleMetricExporter(),
	// }),
})

sdk.start()
