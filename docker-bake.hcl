variable "TAG" {
  default = "1.1.1"
}

group "default" {
  targets = ["ui", "api"]
}

target "ui" {
  context    = "."
  dockerfile = "frontend/Dockerfile.prod"
  tags = [
    "jonymaster/catalogit-ui:${TAG}",
    "jonymaster/catalogit-ui:latest",
  ]
  platforms = ["linux/amd64", "linux/arm64"]
}

target "api" {
  context    = "./backend"
  dockerfile = "Dockerfile"
  tags = [
    "jonymaster/catalogit-api:${TAG}",
    "jonymaster/catalogit-api:latest",
  ]
  platforms = ["linux/amd64", "linux/arm64"]
}
