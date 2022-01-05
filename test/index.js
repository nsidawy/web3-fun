import B from "bech32";
import $ from "jquery";

const policyId = "424deb9056d16add0ae37cc654f8f4ae17e99efa9dd9fe5f8df1823c";
const policyIdUInt8Array = hexStringToArrayBuffer(policyId);

function a2hex(s) {
    var hex = "";
    for (var i=0; i < s.length; i++) {
        hex += s.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
}

function hex2a(hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function hexStringToArrayBuffer(hexString) {
	// remove the leading 0x
	hexString = hexString.replace(/^0x/, '');
	
	// ensure even number of characters
	if (hexString.length % 2 != 0) {
		console.log('WARNING: expecting an even number of characters in the hexString');
	}
	
	// check for some non-hex characters
	var bad = hexString.match(/[G-Z\s]/i);
	if (bad) {
		console.log('WARNING: found non-hex characters', bad);    
	}
	
	// split the string into pairs of octets
	var pairs = hexString.match(/[\dA-F]{2}/gi);
	
	// convert the octets to integers
	var integers = pairs.map(function(s) {
		return parseInt(s, 16);
	});
	
	var array = new Uint8Array(integers);				
	return array.buffer;
}

export async function getWalletStats() {
    const isEnabled = await cardano.enable()
    if (!isEnabled) {
        return;
    }
    const networkId = await cardano.getNetworkId();
    $("#network").html(networkId == 1 ? "Mainnet" : "Testnet");
    const address = await getAddress();
    $("#address").html(address);
    const balance = await getBalance();
    $("#balance").html(valueToUl(balance));
    document.getElementById("payment-button").disabled = false;

    const nuggets = [];
    const sauces = [];
    for (var asset in balance) {
        const parts = asset.split(".");
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
    $("#dip-button").prop("disabled", false);
 }

async function initiatePayment() {
    const address = await cardano.getChangeAddress()
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
    const witnessSet = await cardano.signTx(tx);
    
    const signResponse = await fetch("/getsignedtx?txBytes=" + tx + "&witness=" + witnessSet)
    const signedTx = await signResponse.text()
    await cardano.submitTx(signedTx);
}

async function initiateDip() {
    const address = await cardano.getChangeAddress()
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
    const witnessSet = await cardano.signTx(tx);
    
    const signResponse = await fetch("/getsignedtx?txBytes=" + tx + "&witness=" + witnessSet)
    const signedTx = await signResponse.text()
    await cardano.submitTx(signedTx);
}

function valueToUl(value){
    var html = "<ul>";
    for(var asset in value) {
        html += `<li>${value[asset]} ${asset}</li>`;
    }
    html += "</ul>";
    return html;
}

function parseValue(v) {
    var value = null;
    if(typeof(v) === "number") {
        value = {
            lovelace: v
        };
    } else {
        const lovelace = v[0];
        value = {
            lovelace
        };
        for (var policyStr in v[1]) {
            var policyInts = new Uint8Array(policyStr.split(",").map(v => parseInt(v)));
            const policy = uint8ArrayToHexString(policyInts);
            for (var assetStr in v[1][policyStr]) {
                var assetInts = new Uint8Array(assetStr.split(",").map(v => parseInt(v)));
                const asset = hex2a(uint8ArrayToHexString(assetInts));
                value[policy + "." + asset] = v[1][policyStr][assetStr];
            }
        }
    }
    return value;
}

async function getBalance() {
    const balanceHex = await cardano.getBalance();
    const balanceBuffer = hexStringToArrayBuffer(balanceHex);
    const balance = CBOR.decode(balanceBuffer);
    console.log(balance);
    return parseValue(balance);
}

async function getAddress() {
    const address = await cardano.getChangeAddress()
    const datatosend = { address: address }
    const payload = JSON.stringify(datatosend)
    const response = await fetch("/getBech32Address", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: payload
    });
    return await response.text()
}

function uint8ArrayToHexString(arr) {
    var hex = "";
    for(var i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, "0");
    }
    return hex;
}

function parseUtxo(utxo) {
    const input = utxo[0];
    const output = utxo[1];
    const transactionId = uint8ArrayToHexString(input[0]);
    const transactionIndex = input[1];
    const utxoValue = parseValue(output[1]);

    console.log(transactionId + "#" + transactionIndex);
    console.log(utxoValue);
}

async function getUtxos() {
    const utxosHex = await cardano.getUtxos();
    const utxos = utxosHex.map(u => CBOR.decode(hexStringToArrayBuffer(u)));
    for(var i = 0; i < utxos.length; i++){
        parseUtxo(utxos[i]);
    }
}

window.addEventListener('load', (event) => {
    $("#get-stats-button").on("click", () => getWalletStats());
    $("#payment-button").on("click", () => initiatePayment());
    $("#dip-button").on("click", () => initiateDip());
});