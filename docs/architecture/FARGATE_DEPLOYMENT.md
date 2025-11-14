# Structurizr Deployment to AWS ECS Fargate

Complete guide for deploying Structurizr architecture diagrams to AWS ECS Fargate.

## Overview

This deployment approach:
- Bakes DSL files directly into the Docker image
- Runs Structurizr Lite as a containerized web service
- Deploys to AWS ECS Fargate (serverless container platform)
- Requires rebuild/redeploy to update architecture diagrams

## Prerequisites

- AWS CLI configured with appropriate credentials
- Docker installed locally
- AWS ECR repository created for the image
- ECS cluster created (Fargate launch type)

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────┐
│  Application    │
│  Load Balancer  │
└──────┬──────────┘
       │ HTTP:8080
       ▼
┌─────────────────┐
│  ECS Fargate    │
│   Service       │
│  ┌───────────┐  │
│  │Structurizr│  │
│  │Container  │  │
│  └───────────┘  │
└─────────────────┘
```

---

## Step 1: Build the Docker Image

### 1.1 Local Build and Test

```bash
# From project root
docker build -t structurizr:latest .

# Test locally
docker run -d --name structurizr-test -p 8080:8080 structurizr:latest

# Verify it works
open http://localhost:8080

# Clean up test container
docker stop structurizr-test && docker rm structurizr-test
```

### 1.2 What's Included in the Image

The Docker image contains:
- `docs/architecture/ciam.dsl` - Your architecture definition
- `docs/architecture/structurizr.properties` - Auto-refresh configuration
- `docs/architecture/*.md` - Documentation files (if using Structurizr documentation features)
- Auto-generated `ciam.dsl.json` - Created by Structurizr on startup

---

## Step 2: Push to Amazon ECR

### 2.1 Create ECR Repository (One-time setup)

```bash
# Set your AWS region and repository name
AWS_REGION=us-east-1
ECR_REPO_NAME=structurizr

# Create ECR repository
aws ecr create-repository \
  --repository-name $ECR_REPO_NAME \
  --region $AWS_REGION \
  --image-scanning-configuration scanOnPush=true
```

### 2.2 Authenticate Docker to ECR

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

### 2.3 Tag and Push Image

```bash
# Tag the image for ECR
ECR_URL=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME

docker tag structurizr:latest $ECR_URL:latest
docker tag structurizr:latest $ECR_URL:$(git rev-parse --short HEAD)

# Push to ECR
docker push $ECR_URL:latest
docker push $ECR_URL:$(git rev-parse --short HEAD)
```

**Note:** Tagging with git commit hash allows version tracking and rollbacks.

---

## Step 3: Create ECS Task Definition

### 3.1 Sample Task Definition JSON

Save this as `ecs-task-definition.json`:

```json
{
  "family": "structurizr-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::{AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "structurizr",
      "image": "{ECR_URL}:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "STRUCTURIZR_WORKSPACE_FILENAME",
          "value": "ciam"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/structurizr",
          "awslogs-region": "{AWS_REGION}",
          "awslogs-stream-prefix": "structurizr"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/ || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      }
    }
  ]
}
```

**Replace placeholders:**
- `{AWS_ACCOUNT_ID}` - Your AWS account ID
- `{ECR_URL}` - Your ECR repository URL
- `{AWS_REGION}` - Your AWS region (e.g., us-east-1)

### 3.2 Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/structurizr \
  --region $AWS_REGION
```

### 3.3 Register Task Definition

```bash
# Replace placeholders in task definition
sed -i.bak \
  -e "s/{AWS_ACCOUNT_ID}/$AWS_ACCOUNT_ID/g" \
  -e "s|{ECR_URL}|$ECR_URL|g" \
  -e "s/{AWS_REGION}/$AWS_REGION/g" \
  ecs-task-definition.json

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region $AWS_REGION
```

---

## Step 4: Create ECS Service

### 4.1 Create Application Load Balancer (One-time)

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name structurizr-alb \
  --subnets subnet-xxxxxx subnet-yyyyyy \
  --security-groups sg-xxxxxxxxx \
  --region $AWS_REGION

# Create target group
aws elbv2 create-target-group \
  --name structurizr-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id vpc-xxxxxxx \
  --target-type ip \
  --health-check-path / \
  --health-check-interval-seconds 30 \
  --region $AWS_REGION

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...
```

### 4.2 Create ECS Service

```bash
aws ecs create-service \
  --cluster your-cluster-name \
  --service-name structurizr-service \
  --task-definition structurizr-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxx,subnet-yyyyyy],securityGroups=[sg-xxxxxxxxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=structurizr,containerPort=8080" \
  --region $AWS_REGION
```

---

## Step 5: Access Your Diagrams

Once deployed, access Structurizr at:
- **ALB DNS:** `http://structurizr-alb-xxxxxxxxx.{region}.elb.amazonaws.com`
- **Direct URL:** `http://structurizr-alb-xxxxxxxxx.{region}.elb.amazonaws.com/workspace/diagrams`

### Recommended: Set up HTTPS

1. **Get ACM Certificate:**
   ```bash
   aws acm request-certificate \
     --domain-name structurizr.yourdomain.com \
     --validation-method DNS
   ```

2. **Update ALB Listener to HTTPS:**
   ```bash
   aws elbv2 create-listener \
     --load-balancer-arn arn:aws:elasticloadbalancing:... \
     --protocol HTTPS \
     --port 443 \
     --certificates CertificateArn=arn:aws:acm:... \
     --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...
   ```

3. **Create Route53 DNS record** pointing to ALB

---

## Updating Architecture Diagrams

### Workflow for Updates

1. **Edit DSL files locally:**
   ```bash
   code docs/architecture/ciam.dsl
   ```

2. **Rebuild Docker image:**
   ```bash
   docker build -t structurizr:latest .
   ```

3. **Tag with new version:**
   ```bash
   VERSION=$(git rev-parse --short HEAD)
   docker tag structurizr:latest $ECR_URL:$VERSION
   docker tag structurizr:latest $ECR_URL:latest
   ```

4. **Push to ECR:**
   ```bash
   docker push $ECR_URL:$VERSION
   docker push $ECR_URL:latest
   ```

5. **Update ECS service:**
   ```bash
   aws ecs update-service \
     --cluster your-cluster-name \
     --service structurizr-service \
     --force-new-deployment \
     --region $AWS_REGION
   ```

6. **Monitor deployment:**
   ```bash
   aws ecs describe-services \
     --cluster your-cluster-name \
     --services structurizr-service \
     --region $AWS_REGION
   ```

### Automated Deployment Script

Create `deploy.sh` for convenience:

```bash
#!/bin/bash
set -e

# Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME=structurizr
ECR_URL=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME
ECS_CLUSTER=your-cluster-name
ECS_SERVICE=structurizr-service

# Get version from git
VERSION=$(git rev-parse --short HEAD)

echo "🔨 Building Docker image..."
docker build -t structurizr:$VERSION .

echo "🏷️  Tagging image..."
docker tag structurizr:$VERSION $ECR_URL:$VERSION
docker tag structurizr:$VERSION $ECR_URL:latest

echo "🔐 Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_URL

echo "📤 Pushing to ECR..."
docker push $ECR_URL:$VERSION
docker push $ECR_URL:latest

echo "🚀 Deploying to ECS..."
aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment \
  --region $AWS_REGION

echo "✅ Deployment initiated! Version: $VERSION"
echo "📊 Monitor: aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE"
```

Make it executable: `chmod +x deploy.sh`

---

## Cost Optimization

### Fargate Pricing (as of 2024)

**Task Configuration:**
- vCPU: 0.25 (256) = ~$0.01288/hour
- Memory: 0.5 GB (512 MB) = ~$0.00141/hour
- **Total: ~$0.014/hour or ~$10/month** (running 24/7)

### Cost Reduction Strategies

1. **Run only during business hours:**
   - Use EventBridge rules to stop/start service
   - Save ~70% on non-business hours

2. **Use Fargate Spot:**
   - Up to 70% discount
   - Acceptable for development/staging environments

3. **Right-size resources:**
   - Current: 256 CPU / 512 MB memory
   - Structurizr is lightweight, may work with 256 CPU / 256 MB

---

## Monitoring and Troubleshooting

### CloudWatch Logs

```bash
# View recent logs
aws logs tail /ecs/structurizr --follow --region $AWS_REGION

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/structurizr \
  --filter-pattern "ERROR" \
  --region $AWS_REGION
```

### Health Check Status

```bash
# Check service health
aws ecs describe-services \
  --cluster your-cluster-name \
  --services structurizr-service \
  --query 'services[0].{runningCount:runningCount,desiredCount:desiredCount,healthCheck:healthCheckGracePeriodSeconds}' \
  --region $AWS_REGION

# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --region $AWS_REGION
```

### Common Issues

**Container won't start:**
- Check CloudWatch logs for errors
- Verify ECR image exists: `aws ecr describe-images --repository-name structurizr`
- Verify task definition CPU/memory settings

**Health check failing:**
- Ensure container listens on port 8080
- Verify security group allows ALB → container traffic
- Check health check path is `/` not `/workspace/diagrams`

**Diagrams not loading:**
- Verify `STRUCTURIZR_WORKSPACE_FILENAME=ciam` (no .dsl extension)
- Check files were copied correctly: `docker run --rm -it structurizr:latest ls -la /usr/local/structurizr/`

---

## Security Considerations

### Recommended Security Groups

**ALB Security Group:**
- Inbound: 443 (HTTPS) from 0.0.0.0/0
- Inbound: 80 (HTTP) from 0.0.0.0/0 (redirect to HTTPS)
- Outbound: 8080 to ECS task security group

**ECS Task Security Group:**
- Inbound: 8080 from ALB security group only
- Outbound: 443 to 0.0.0.0/0 (for health checks, if needed)

### Authentication Options

Structurizr Lite doesn't have built-in authentication. Options:

1. **ALB-based authentication** (Recommended):
   - Use ALB's built-in Cognito or OIDC authentication
   - Configure listener rules to require authentication

2. **VPN/Private deployment:**
   - Deploy in private subnets only
   - Access via VPN or AWS PrivateLink

3. **Reverse proxy with auth:**
   - Add nginx/Apache container with basic auth
   - Put in front of Structurizr container

---

## Terraform Configuration (Optional)

For infrastructure-as-code, here's a sample Terraform configuration:

```hcl
# ecr.tf
resource "aws_ecr_repository" "structurizr" {
  name                 = "structurizr"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ecs.tf
resource "aws_ecs_task_definition" "structurizr" {
  family                   = "structurizr-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name  = "structurizr"
    image = "${aws_ecr_repository.structurizr.repository_url}:latest"
    essential = true

    portMappings = [{
      containerPort = 8080
      protocol      = "tcp"
    }]

    environment = [{
      name  = "STRUCTURIZR_WORKSPACE_FILENAME"
      value = "ciam"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.structurizr.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "structurizr"
      }
    }
  }])
}

resource "aws_ecs_service" "structurizr" {
  name            = "structurizr-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.structurizr.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.structurizr.arn
    container_name   = "structurizr"
    container_port   = 8080
  }
}
```

---

## Summary

**Deployment Commands (Quick Reference):**

```bash
# Build and test locally
docker build -t structurizr:latest .
docker run -d --name test -p 8080:8080 structurizr:latest
open http://localhost:8080

# Deploy to ECS
./deploy.sh  # Uses automated script above

# Update architecture
# 1. Edit docs/architecture/ciam.dsl
# 2. Run: ./deploy.sh
# 3. Wait 2-3 minutes for deployment
```

**URLs:**
- Local testing: `http://localhost:8080`
- ECS Fargate: `http://{ALB-DNS}/workspace/diagrams`
- Production (with DNS): `https://structurizr.yourdomain.com/workspace/diagrams`

**Cost:** ~$10/month (24/7) or ~$3/month (business hours only)
