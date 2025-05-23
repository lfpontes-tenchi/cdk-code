import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export class CdkCodeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Criando uma função Lambda
    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'hello.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        REGION: cdk.Stack.of(this).region,
      },
    });

    // Exportando o ARN da função Lambda como output
    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: helloFunction.functionArn,
      description: 'ARN da função Lambda',
      exportName: 'HelloFunctionArn',
    });
  }
}
