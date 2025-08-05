#!/bin/bash
##############################################################
# CREATED DATE: 2025年08月05日 星期二 22时20分37秒
# CREATED BY: qiangxu, toxuqiang@gmail.com
##############################################################

#!/bin/bash
echo "Installing dependencies..."
npm install

echo "Running attestation test..."
node src/attest-test.js

