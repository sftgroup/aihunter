#!/bin/bash
# AIHunter Worker 启动脚本
# 同时运行 EVM 链监听 + SOL 链监听

echo "🚀 启动 EVM Worker..."
python -m src.main &
EVM_PID=$!

echo "🚀 启动 SOL Worker..."
python -m src.sol_worker &
SOL_PID=$!

echo "✅ EVM Worker PID: $EVM_PID"
echo "✅ SOL Worker PID: $SOL_PID"

# 等待任意一个退出
wait -n $EVM_PID $SOL_PID

# 如果其中一个挂了，全部退出
kill $EVM_PID $SOL_PID 2>/dev/null
