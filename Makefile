.PHONY: run
run:
	deno run --allow-all src/index.js

.PHONY: contracts
contracts:
	docker run -it --rm \
		-v "$(shell pwd)/contracts:/src" -w /src \
		ethereum/solc:0.8.16 \
		-o build --overwrite --abi --bin-runtime Trader.sol
