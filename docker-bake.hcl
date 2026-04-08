variable "TAG" {
  default = "1.0.0"
}

group "default" {
  targets = ["ui", "api"]
}

target "ui" {
  context    = "."
  dockerfile = "frontend/Dockerfile.prod"
  tags       = ["jonymaster/catalogit-ui:${TAG}"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "api" {
  context    = "./backend"
  dockerfile = "Dockerfile"
  tags       = ["jonymaster/catalogit-api:${TAG}"]
  platforms  = ["linux/amd64", "linux/arm64"]
}
