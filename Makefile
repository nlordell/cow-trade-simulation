CONTRACTS := AnyoneAuthenticator PhonyERC20 Trader
ARTIFACTS := $(patsubst %,contracts/build/%.json,$(CONTRACTS))

.PHONY: run
run: contracts
	deno run \
		--allow-env=INFURA_PROJECT_ID \
		--allow-net=mainnet.infura.io \
		src/index.js

.PHONY: contracts
contracts: $(ARTIFACTS)

contracts/build/%.json: contracts/%.sol
	mkdir -p contracts/build
	docker run -it --rm \
		-v "$(abspath contracts):/src" -w "/src" \
		ethereum/solc:0.8.16 \
		--overwrite --metadata-hash none --optimize --optimize-runs 1000000 \
		--combined-json abi,bin-runtime --output-dir . $(notdir $<)
	cat contracts/combined.json | jq '.contracts["$*.sol:$*"]' > $@
	rm -f contracts/combined.json

