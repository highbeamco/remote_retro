#!/usr/bin/env bash
# One-time (idempotent): let GitHub Actions in highbeamco/remote_retro deploy to Cloud Run
# via Workload Identity Federation — short-lived tokens, no service account keys.
# Run via: deploy/run.sh ./deploy/setup-github.sh
set -euo pipefail

PROJECT="${PROJECT:-hb-remote-retro}"
REGION="${REGION:-us-central1}"
GITHUB_REPO="${GITHUB_REPO:-highbeamco/remote_retro}"
POOL="github"
PROVIDER="github-oidc"
DEPLOYER="remote-retro-deployer"
RUNTIME_SA="remote-retro-run@$PROJECT.iam.gserviceaccount.com"
REPO="remote-retro"

gcloud config set project "$PROJECT" --quiet >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
DEPLOYER_SA="$DEPLOYER@$PROJECT.iam.gserviceaccount.com"

echo "==> Deployer service account"
gcloud iam service-accounts describe "$DEPLOYER_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOYER" --display-name="Remote Retro deployer (GitHub Actions)"
# Deploy new revisions of the service…
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOYER_SA" \
  --role=roles/run.developer --condition=None >/dev/null
# …that run as the runtime service account…
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member="serviceAccount:$DEPLOYER_SA" \
  --role=roles/iam.serviceAccountUser >/dev/null
# …from images it pushes to this one repository.
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:$DEPLOYER_SA" --role=roles/artifactregistry.writer >/dev/null

echo "==> Workload identity pool + GitHub OIDC provider"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '$GITHUB_REPO' && assertion.ref == 'refs/heads/master'"

echo "==> Allow $GITHUB_REPO (master only) to act as the deployer"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" \
  >/dev/null

echo "==> Done"
echo "workload_identity_provider: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "service_account:            $DEPLOYER_SA"
