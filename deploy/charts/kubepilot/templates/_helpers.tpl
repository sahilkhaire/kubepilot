{{/*
Expand the name of the chart.
*/}}
{{- define "kubepilot.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kubepilot.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kubepilot.labels" -}}
helm.sh/chart: {{ include "kubepilot.chart" . }}
{{ include "kubepilot.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "kubepilot.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kubepilot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Chart label
*/}}
{{- define "kubepilot.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "kubepilot.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kubepilot.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PodDisruptionBudget enabled: explicit value, else true when replicaCount >= 2.
*/}}
{{- define "kubepilot.pdb.enabled" -}}
{{- if kindIs "bool" .Values.podDisruptionBudget.enabled -}}
{{- .Values.podDisruptionBudget.enabled -}}
{{- else -}}
{{- ge (int .Values.replicaCount) 2 -}}
{{- end -}}
{{- end }}

{{/*
Secret name for envFrom
*/}}
{{- define "kubepilot.secretName" -}}
{{- if .Values.existingSecret }}
{{- .Values.existingSecret }}
{{- else }}
{{- include "kubepilot.fullname" . }}
{{- end }}
{{- end }}
