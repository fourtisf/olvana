// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// Test-only stand-in for USDG (6 decimals). `strict` mimics USDT: approve from non-zero to non-zero reverts.
contract MockToken {
    string public constant name = "Global Dollar";
    string public constant symbol = "USDG";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    bool public strict;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setStrict(bool s) external { strict = s; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; totalSupply += a; emit Transfer(address(0), to, a); }
    function approve(address s, uint256 a) external returns (bool) {
        if (strict) require(a == 0 || allowance[msg.sender][s] == 0, "approve from non-zero to non-zero");
        allowance[msg.sender][s] = a; emit Approval(msg.sender, s, a); return true;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; emit Transfer(msg.sender, to, a); return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a; balanceOf[to] += a; emit Transfer(f, to, a); return true;
    }
}
