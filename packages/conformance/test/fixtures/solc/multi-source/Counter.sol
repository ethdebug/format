// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "./Math.sol";

contract Counter {
    uint256 public value;

    function increment(uint256 amount) public {
        value = Math.add(value, amount);
    }
}
