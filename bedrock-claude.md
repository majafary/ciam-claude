# Claude Code with Bedrock - AWS Marketplace Subscription Question

## User Question 1

I am trying to use Claude Code with Bedrock. I am getting an error user is not authorized to perform: aws-marketplace:Subscription on resource \* because no identity-based policy allows the aws-marketplace:Subscribe on action. What is the dependency on aws-marketplace:Subscribe why is it needed

## Claude Response 1

Based on the search results, I can explain why the AWS Marketplace permissions are needed for Claude Code with Bedrock:

### Why AWS Marketplace Permissions Are Required

When you first invoke an Amazon Bedrock serverless model (like Claude) in an AWS account, Bedrock attempts to automatically enable the model by creating what's essentially a marketplace subscription. This is a one-time setup step that happens the first time any model is used in your account.

The key permissions needed are:

- `aws-marketplace:Subscribe`
- `aws-marketplace:ViewSubscriptions`

### The Good News

Once a model has been enabled in your account (either manually or through auto-enablement), all users in the account can invoke the model without needing AWS Marketplace permissions. These permissions are only required during the first-time setup.

### How to Resolve This

You have two options:

1. **One-time enablement by an admin**: Have someone with AWS Marketplace permissions enable the Claude models once through the Bedrock console (under "Model access"). After that, your IAM user won't need marketplace permissions.

2. **Add the marketplace permissions**: According to the official Claude Code documentation, the recommended IAM policy includes marketplace permissions with a condition that restricts them to only be used via Bedrock:

```json
{
  "Sid": "AllowMarketplaceSubscription",
  "Effect": "Allow",
  "Action": ["aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:CalledViaLast": "bedrock.amazonaws.com"
    }
  }
}
```

The condition `"aws:CalledViaLast": "bedrock.amazonaws.com"` ensures these permissions can only be used when called through Bedrock, not directly accessing AWS Marketplace.

The easiest solution is typically option 1 - have an admin enable the models once, then you won't need these permissions at all.

---

## User Question 2

Do I need to buy AWS Marketplace subscription for Claude to use this? Is this how Claude gets paid when I use Claude Code with Anthropic models in Bedrock?

## Claude Response 2

Great question! Let me clarify this because it's a common point of confusion:

### No, You Don't Need to "Buy" a Subscription

**You do NOT need to purchase an AWS Marketplace subscription in the traditional sense.** With Bedrock's on-demand pricing, you're only billed for the tokens you use—no time-based commitments or upfront subscription fees.

### What the "Marketplace Subscription" Actually Means

The AWS Marketplace permission requirement is a bit of a misnomer. Here's what actually happens:

When you first use a Bedrock model like Claude, AWS automatically creates what it calls a "marketplace subscription" behind the scenes. This is just AWS's internal mechanism for enabling the model in your account—it's not a paid subscription you purchase. It's a one-time enablement step that happens automatically when you first invoke the model.

### How Anthropic Gets Paid

Yes, this is how Anthropic gets paid when you use Claude through Bedrock:

1. **Pay-per-use model**: You pay based on the number of tokens processed by Claude models, with costs varying by model type and AWS region. For example, Claude might cost around $0.003 per 1,000 input tokens and $0.015 per 1,000 output tokens.

2. **No separate subscription fee**: You're not paying Anthropic directly—instead, AWS bills you for token usage, and AWS has a revenue-sharing agreement with Anthropic in the background.

3. **AWS handles billing**: Everything appears on your AWS bill as Bedrock usage.

### The Bottom Line

Think of it like this: the "marketplace subscription" is just AWS's way of tracking which models you've enabled in your account. You only pay for what you actually use (tokens processed), not for access to the model itself.
