.PHONY: test no-bake chart-check

test:
	go test ./...

no-bake:
	@! grep -R --include='*.go' --include='Dockerfile' -E 'mongodb(\+srv)?:\/\/|OWNER_PASSWORD=' . | grep -v '_test.go' | grep -v 'os.Getenv' | grep .

chart-check:
	@command -v helm >/dev/null 2>&1 || { echo "helm not found, skipping chart-check"; exit 0; }
	@helm template test deploy/charts/kubepilot \
	  --set image.repository=example/kubepilot --set image.tag=dev \
	  --set ingress.host=console.example.internal \
	  --set mongodbUri=mongodb://mongo:27017/kubepilot \
	  --set sessionSecret=testsecret --set ownerPassword=testpass \
	  | grep -q 'name: POD_NAMESPACE'
	@helm template test deploy/charts/kubepilot \
	  --set image.repository=example/kubepilot --set image.tag=dev \
	  --set ingress.host=console.example.internal \
	  --set mongodbUri=mongodb://mongo:27017/kubepilot \
	  --set sessionSecret=testsecret --set ownerPassword=testpass \
	  | grep -q 'sessionAffinity: ClientIP'
	@helm template test deploy/charts/kubepilot \
	  --set image.repository=example/kubepilot --set image.tag=dev \
	  --set ingress.host=console.example.internal \
	  --set mongodbUri=mongodb://mongo:27017/kubepilot \
	  --set sessionSecret=testsecret --set ownerPassword=testpass \
	  | grep -q 'kind: PodDisruptionBudget'
