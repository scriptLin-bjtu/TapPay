// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TapPay {
    enum OrderStatus { OPEN, PAID, CANCELLED }

    struct Order {
        address merchant;
        uint256 amount;        // USDC, 6 decimals
        uint64  expiresAt;
        OrderStatus status;
    }

    IERC20 public immutable USDC;
    uint256 public nextOrderId = 1;
    uint64  public constant ORDER_LIFESPAN = 5 minutes;

    mapping(uint256 => Order)   public orders;
    mapping(address => uint256) public latestOrderId;

    event OrderCreated(uint256 indexed orderId, address indexed merchant, uint256 amount, uint64 expiresAt);
    event OrderPaid   (uint256 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount);
    event OrderCancelled(uint256 indexed orderId, address indexed merchant);

    constructor(IERC20 _usdc) {
        USDC = _usdc;
    }

    function createOrder(uint256 amount) external returns (uint256 orderId) {
        require(amount > 0, "amount=0");
        orderId = nextOrderId++;
        uint64 exp = uint64(block.timestamp) + ORDER_LIFESPAN;
        orders[orderId] = Order(msg.sender, amount, exp, OrderStatus.OPEN);
        latestOrderId[msg.sender] = orderId;
        emit OrderCreated(orderId, msg.sender, amount, exp);
    }

    function pay(uint256 orderId) external {
        Order storage o = orders[orderId];
        require(o.status == OrderStatus.OPEN,   "not open");
        require(block.timestamp <= o.expiresAt, "expired");

        o.status = OrderStatus.PAID;
        require(USDC.transferFrom(msg.sender, o.merchant, o.amount), "transfer failed");
        emit OrderPaid(orderId, o.merchant, msg.sender, o.amount);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage o = orders[orderId];
        require(o.merchant == msg.sender, "not merchant");
        require(o.status == OrderStatus.OPEN, "not open");
        o.status = OrderStatus.CANCELLED;
        emit OrderCancelled(orderId, msg.sender);
    }

    function getLatestOrder(address merchant) external view returns (uint256 orderId, Order memory order) {
        orderId = latestOrderId[merchant];
        order = orders[orderId];
    }
}
