const express = require("express")
const bodyParser = require("body-parser")
const path = require("path")
const dotenv = require("dotenv")
    .config({ path: '.env' })
const S = require('@emurgo/cardano-serialization-lib-nodejs/cardano_serialization_lib.js')

const app = express();
const port = process.env.PORT;
const vendingAddress = process.env.VENDING_ADDRESS;

app.use(bodyParser.json());
app.use(express.static('test'));

app.get('/', (req, res) => {
    res.sendFile('./test/index.html', { root: __dirname });
});

app.get('/vendingAddress', (req, res) => {
    res.send(vendingAddress);
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
    const utxos = req.body.utxosHex.map(u => S.TransactionUnspentOutput.from_bytes(Buffer.from(u, "hex")))
    const lovelace = req.body.lovelace;

    const outputs = S.TransactionOutputs.new();
    outputs.add(
        S.TransactionOutput.new(
            S.Address.from_bech32(vendingAddress),
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
        S.Address.from_bech32(vendingAddress),
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

app.get('/getsignedtx', (req, res) => {
    const transaction = S.Transaction.from_bytes(Buffer.from(req.query.txBytes, "hex"))
    const witnessSet = S.TransactionWitnessSet.from_bytes(Buffer.from(req.query.witness, "hex"))
    const signedTx = S.Transaction.new(transaction.body(), witnessSet)
    const bsignedTx = Buffer.from(signedTx.to_bytes(), "hex").toString("hex")
    res.send(bsignedTx)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});
