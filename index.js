const express = require("express")
const bodyParser = require("body-parser")
const path = require("path")
const dotenv = require("dotenv")
    .config({ path: '.env' })
const S = require('@emurgo/cardano-serialization-lib-nodejs/cardano_serialization_lib.js')

const app = express();

const PORT = process.env.PORT;
const VENDING_ADDRESS_BECH32 = process.env.VENDING_ADDRESS_BECH32;
const MINTING_ADDRESS_BECH32 = process.env.MINTING_ADDRESS_BECH32;
// Value retrieved by using "cardano-cli address key-hash"
const MINTING_KEY_HASH = process.env.MINTING_KEY_HASH;
// Getting this value requires:
//  * Getting the CBOR hex value out of the *skey file
//  * Dropping the first 4 characters "5820"
//  * Taking the output of "echo <remaing CBOR hex values> | bech32 ed25519_sk"
const MINTING_SKEY_BECH32 = process.env.MINTING_SKEY_BECH32;
// Getting this value requires:
//  * Getting the CBOR hex value out of the *skey file
//  * Dropping the first 4 characters "5820"
const MINTING_KEY_CBOR = process.env.MINTING_KEY_CBOR;

app.use(bodyParser.json());
app.use(express.static('test'));

app.get('/', (req, res) => {
    res.sendFile('./test/index.html', { root: __dirname });
});

app.get('/vendingAddress', (req, res) => {
    res.send(VENDING_ADDRESS_BECH32);
});

app.post('/getBech32Address', (req, res) => {
    const bech32 = S.Address.from_bytes(Buffer.from(req.body.address, 'hex')).to_bech32();
    res.send(bech32);
});

function getTxConfig() {
    // TODO: determine a more dyanamic way to pull this info?
    return S.TransactionBuilderConfigBuilder.new()
        .max_tx_size(16384)
        .pool_deposit(S.BigNum.from_str('500000000'))
        .key_deposit(S.BigNum.from_str('2000000'))
        .fee_algo(S.LinearFee.new(S.BigNum.from_str('44'), S.BigNum.from_str('155381')))
        .max_value_size(5000)
        .coins_per_utxo_word(S.BigNum.from_str('34482'))
        .build()
}

app.post('/payVendingMachine', (req, res) => {
    const txBuilder =  S.TransactionBuilder.new(getTxConfig());
    const lovelace = req.body.lovelace;

    const outputs = S.TransactionOutputs.new();
    outputs.add(
        S.TransactionOutput.new(
            S.Address.from_bech32(VENDING_ADDRESS_BECH32),
            S.Value.new(S.BigNum.from_str(lovelace.toString()))
        )
    );
    txBuilder.add_output(outputs.get(0));

    const transactionUnspentOutputs = S.TransactionUnspentOutputs.new();
    req.body.utxosHex.forEach((u => transactionUnspentOutputs.add(S.TransactionUnspentOutput.from_bytes(Buffer.from(u, "hex")))));
    txBuilder.add_inputs_from(transactionUnspentOutputs, S.CoinSelectionStrategyCIP2.LargestFirst);

    const changeAddress = S.Address.from_bytes(Buffer.from(req.body.address, 'hex'));
    txBuilder.add_change_if_needed(changeAddress);

    const transaction = S.Transaction.new(txBuilder.build(), S.TransactionWitnessSet.new());
    const transactionBytes = Buffer.from(transaction.to_bytes(), "hex").toString("hex");
    res.send(transactionBytes)
});

app.post('/dip', (req, res) => {
    const txBuilder =  S.TransactionBuilder.new(getTxConfig());
    const lovelace = 5000000;

    const policyScriptHash = S.ScriptHash.from_bytes(Buffer.from(req.body.policyHex, "hex"));
    const nuggetAssetName = S.AssetName.new(Buffer.from(req.body.nuggetHex, "hex"));
    const sauceAssetName = S.AssetName.new(Buffer.from(req.body.sauceHex, "hex"));

    const multiAsset = S.MultiAsset.new();
    const assets = S.Assets.new();
    assets.insert(nuggetAssetName, S.BigNum.from_str("1"));
    assets.insert(sauceAssetName, S.BigNum.from_str("1"));
    multiAsset.insert(policyScriptHash, assets);
    txBuilder.add_output_coin_and_asset(
        S.Address.from_bech32(VENDING_ADDRESS_BECH32),
        S.BigNum.from_str(lovelace.toString()),
        multiAsset);

    const transactionUnspentOutputs = S.TransactionUnspentOutputs.new();
    req.body.utxosHex.forEach((u => transactionUnspentOutputs.add(S.TransactionUnspentOutput.from_bytes(Buffer.from(u, "hex")))));
    txBuilder.add_inputs_from(transactionUnspentOutputs, S.CoinSelectionStrategyCIP2.LargestFirst);

    const changeAddress = S.Address.from_bytes(Buffer.from(req.body.address, 'hex'));
    txBuilder.add_change_if_needed(changeAddress);

    const transaction = S.Transaction.new(txBuilder.build(), S.TransactionWitnessSet.new());
    const transactionBytes = Buffer.from(transaction.to_bytes(), "hex").toString("hex");
    res.send(transactionBytes)
});

function getMintingNativeScript() {
    const mintNativeScript = S.NativeScript.new_script_pubkey(S.ScriptPubkey.new(
        S.Ed25519KeyHash.from_bytes(Buffer.from(MINTING_KEY_HASH, "hex"))));
    //const mintNativeScript = S.NativeScript.new_timelock_start(S.TimelockStart.new(0));
    return mintNativeScript;
}

app.post('/buyEpochCoins', (req, res) => {
    const txBuilder =  S.TransactionBuilder.new(getTxConfig());
    const epochCoinAmount = parseInt(req.body.epochCoinAmount)
    const lovelace = 5000000 * epochCoinAmount;

    const mintingAddress = S.Address.from_bech32(MINTING_ADDRESS_BECH32);
    const buyerAddress = S.Address.from_bytes(Buffer.from(req.body.address, 'hex'));

    // required for native script that requires coins minted after 0 slot
    txBuilder.set_validity_start_interval(10);

    // payout the epoch coins to the buyer address
    // 45706f6368436f696e is EpochCoin in hex
	const epochCoinsAssetName = S.AssetName.new(Buffer.from("45706f6368436f696e", "hex"));
    txBuilder.add_mint_asset_and_output_min_required_coin(
        getMintingNativeScript(),
        epochCoinsAssetName,
        S.Int.new_i32(epochCoinAmount),
        buyerAddress);

    // payout lovelace to minting address
    txBuilder.add_output_coin(
        mintingAddress,
        S.BigNum.from_str(lovelace.toString())
    );

    const transactionUnspentOutputs = S.TransactionUnspentOutputs.new();
    req.body.utxosHex.forEach((u => transactionUnspentOutputs.add(S.TransactionUnspentOutput.from_bytes(Buffer.from(u, "hex")))));
    txBuilder.add_inputs_from(transactionUnspentOutputs, S.CoinSelectionStrategyCIP2.LargestFirst);

    txBuilder.add_change_if_needed(buyerAddress);

    const transaction = S.Transaction.new(txBuilder.build(), S.TransactionWitnessSet.new());
    const transactionBytes = Buffer.from(transaction.to_bytes(), "hex").toString("hex");
    res.send(transactionBytes)
});

app.get('/getsignedtx', (req, res) => {
    const transaction = S.Transaction.from_bytes(Buffer.from(req.query.txBytes, "hex"))
    const witnessSet = S.TransactionWitnessSet.from_bytes(Buffer.from(req.query.witness, "hex"))
    const signedTx = S.Transaction.new(transaction.body(), witnessSet)
    const bsignedTx = Buffer.from(signedTx.to_bytes(), "hex").toString("hex")
    res.send(bsignedTx)
})

app.get('/getmultisignedtx', (req, res) => {
    const transaction = S.Transaction.from_bytes(Buffer.from(req.query.txBytes, "hex"))
    const witnessSet = S.TransactionWitnessSet.from_bytes(Buffer.from(req.query.witness, "hex"))
    // need to pull the vkeys out in order to modify them.
    // calling witnessSet.vkeys().add(...) does not change the contents
    const vkeys = witnessSet.vkeys();
    vkeys.add(
        S.make_vkey_witness(
            S.hash_transaction(transaction.body()),
            S.PrivateKey.from_normal_bytes(Buffer.from(MINTING_KEY_CBOR, "hex"))));
    witnessSet.set_vkeys(vkeys);
    const scripts = S.NativeScripts.new();
    scripts.add(getMintingNativeScript());
    witnessSet.set_native_scripts(scripts);
    const signedTx = S.Transaction.new(transaction.body(), witnessSet)
    const bsignedTx = Buffer.from(signedTx.to_bytes(), "hex").toString("hex")
    res.send(bsignedTx)
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}!`);
});
