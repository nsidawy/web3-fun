const $ = require("jquery");
import { a2hex, hex2a, hexStringToArrayBuffer, uint8ArrayToHexString} from "./hexUtils"
import { getAddress, getUtxos, getBalance} from "./walletUtils"

const policyId = "424deb9056d16add0ae37cc654f8f4ae17e99efa9dd9fe5f8df1823c";

async function getWalletStats() {
    // TODO: should probably have a separate event for "connecting wallet" and getting stats.
    const isEnabled = await cardano.enable()
    if (!isEnabled) {
        return;
    }
    const networkId = await cardano.getNetworkId();
    $("#network").html(networkId == 1 ? "Mainnet" : "Testnet");
    const address = await getAddress(networkId);
    $("#address").html(address);
    const balance = await getBalance();
    $("#balance").html(getBalanceHtmlList(balance));
    
    // enable & update inputs
    setNuggetSauceDropdowns(balance);
    $("#dip-button").prop("disabled", false);
    $("#payment-button").prop("disabled", false);
    $("#epoch-coin-button").prop("disabled", false);
    $("#epoch-coin-input").prop("disabled", false);

    console.log(await getUtxos());
 }

function getBalanceHtmlList(value){
    var html = "<ul>";
    html += `<li>${value.lovelace} lovelace</li>`;
    for(var i = 0; i < value.otherAssets.length; i++) {
        const a = value.otherAssets[i];
        html += `<li>${a.amount} ${a.asset}</li>`;
    }
    html += "</ul>";
    return html;
}

function setNuggetSauceDropdowns(balance) {
    const nuggets = [];
    const sauces = [];
    for (var i = 0; i < balance.otherAssets.length; i++) {
        const a = balance.otherAssets[i];
        const parts = a.asset.split(".");
        if(parts[0] === policyId) {
            if(parts[1].startsWith("Nugget")){
                nuggets.push(parts[1]);
            } else if(parts[1].startsWith("Sauce")){
                sauces.push(parts[1]);
            }
        }
    }
    $("#nugget-input").html(nuggets.map(n => `<option value="${n}">${n}</option>`).join(""));
    $("#sauce-input").html(sauces.map(n => `<option value="${n}">${n}</option>`).join(""));
    $("#nugget-input").prop("disabled", false);
    $("#sauce-input").prop("disabled", false);
}

async function initiatePayment() {
    try {
        //TODO ensure wallet is connected to expected network

        const address = await cardano.getChangeAddress()
        // TODO: handle pagination
        const utxosHex = await cardano.getUtxos();
        const lovelace = parseInt(document.getElementById("lovelace-input").value);

        const datatosend = { address, lovelace, utxosHex }
        const payload = JSON.stringify(datatosend)
        const response = await fetch("/payVendingMachine", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: payload
        });
        const tx = await response.text()
        await completeTransaction(tx);
    } catch (e) {
        console.log(e);
    }
}

async function initiateDip() {
    try {
        //TODO ensure wallet is connected to expected network
        
        const address = await cardano.getChangeAddress()
        // TODO: handle pagination
        const utxosHex = await cardano.getUtxos();
        const nuggetSelection = $("#nugget-input").val()
        const sauceSelection = $("#sauce-input").val()
        const nuggetHex = a2hex(nuggetSelection);
        const sauceHex = a2hex(sauceSelection);
        
        const datatosend = {
            address,
            utxosHex,
            policyHex: policyId,
            nuggetHex: nuggetHex,
            sauceHex: sauceHex 
        };
        const payload = JSON.stringify(datatosend)
        const response = await fetch("/dip", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: payload
        });
        const tx = await response.text()
        await completeTransaction(tx);
    } catch (e) {
        console.log(e)
    }
}

async function initiateEpochCoinBuy() {
    try {
        //TODO ensure wallet is connected to expected network

        const address = await cardano.getChangeAddress()
        // TODO: handle pagination
        const utxosHex = await cardano.getUtxos();
        const epochCoinAmount = parseInt($("#epoch-coin-input").val())

        const datatosend = {
            address,
            utxosHex,
            epochCoinAmount
        };
        const payload = JSON.stringify(datatosend)
        const response = await fetch("/buyEpochCoins", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: payload
        });
        const tx = await response.text()
        const witnessSet = await cardano.signTx(tx);
        const signResponse = await fetch("/getmultisignedtx?txBytes=" + tx + "&witness=" + witnessSet)
        const signedTx = await signResponse.text()
        await cardano.submitTx(signedTx);
    } catch (e) {
        console.log(e);
    }
}

async function completeTransaction(tx) {
    const witnessSet = await cardano.signTx(tx);
    const signResponse = await fetch("/getsignedtx?txBytes=" + tx + "&witness=" + witnessSet)
    const signedTx = await signResponse.text()
    await cardano.submitTx(signedTx);
}

window.addEventListener('load', (event) => {
    $("#get-stats-button").on("click", () => getWalletStats());
    $("#payment-button").on("click", () => initiatePayment());
    $("#dip-button").on("click", () => initiateDip());
    $("#epoch-coin-button").on("click", () => initiateEpochCoinBuy());
    cardano.onNetworkChange(networkId => {
        console.log(networkId);
        getWalletStats();
    })
});