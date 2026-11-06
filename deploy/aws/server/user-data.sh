#!/bin/bash
# First boot of the EC2 server (Amazon Linux 2023): Docker plus the SSM agent (preinstalled). No SSH, no keys.
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker
# 1 GB of swap so a t3.micro never runs out of memory during a restart.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi
mkdir -p /opt/invoice-agent/data
