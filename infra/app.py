"""SL Eazy AWS infrastructure (CDK).

Two stacks, like the sibling apps:
- SlEasyCert (us-east-1): the CloudFront certificate.
- SlEasy (eu-north-1): S3 + CloudFront for the static app at sl.korist.se, and the
  bucket behind /tt/*, where the timetable files live.

There is no API: the browser calls SL's public APIs directly. The one thing that runs
is a nightly job on the shared dev box (stack KoristDev, owned by ../korist-infra) that
turns SL's timetable into those files: see timetable/ and scripts/deploy-timetable.sh.
"""

# pyright: reportArgumentType=false

import os

import aws_cdk as cdk
import boto3
from aws_cdk import (
    Stack,
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
)
from constructs import Construct

ACCOUNT = os.environ.get("CDK_DEFAULT_ACCOUNT")
if not ACCOUNT:
    raise SystemExit("No AWS account: run through the `cdk` CLI with credentials available.")

REGION = "eu-north-1"
ZONE_NAME = "korist.se"
DOMAIN = "sl.korist.se"
SERVER_STACK = "KoristDev"


def server_facts() -> dict[str, str]:
    """Instance id and IAM role name of the shared dev box."""
    cfn = boto3.client("cloudformation", region_name=REGION)
    outputs = {
        o["OutputKey"]: o["OutputValue"]
        for o in cfn.describe_stacks(StackName=SERVER_STACK)["Stacks"][0]["Outputs"]
    }
    ec2 = boto3.client("ec2", region_name=REGION)
    reservation = ec2.describe_instances(InstanceIds=[outputs["OutInstanceId"]])
    profile_arn = reservation["Reservations"][0]["Instances"][0]["IamInstanceProfile"]["Arn"]
    profile_name = profile_arn.rsplit("/", 1)[1]
    role_name = boto3.client("iam").get_instance_profile(InstanceProfileName=profile_name)[
        "InstanceProfile"
    ]["Roles"][0]["RoleName"]
    return {"instance_id": outputs["OutInstanceId"], "role_name": role_name}


class CertStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        self.cert = acm.Certificate(
            self,
            "WebCert",
            domain_name=DOMAIN,
            validation=acm.CertificateValidation.from_dns(zone),
        )


class SlEasyStack(Stack):
    def __init__(
        self, scope: Construct, construct_id: str, cert: acm.ICertificate, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)

        web_bucket = s3.Bucket(
            self,
            "WebBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        # Timetable files, written every night by the job on the dev box:
        #   tt/current.json          which version is live (short cache)
        #   tt/v/<yyyymmdd>/...      one night's files, never changed once written
        #   deploy/                  the job's own code, fetched by the box
        # A version is useful for the nine days it covers, then it expires by itself.
        data_bucket = s3.Bucket(
            self,
            "DataBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            lifecycle_rules=[s3.LifecycleRule(prefix="tt/v/", expiration=cdk.Duration.days(9))],
        )
        server = server_facts()
        # Not "ServerRole": several stacks grant on one box role, and CDK names the
        # inline policy after the construct path, so they would overwrite each other.
        role = iam.Role.from_role_name(self, "SlEasyServerRole", server["role_name"])
        data_bucket.grant_read_write(role)
        # Reading /sl-easy/trafiklab-key needs no grant: the instance has
        # AmazonSSMManagedInstanceCore, which allows ssm:GetParameter on *.

        distribution = cloudfront.Distribution(
            self,
            "Web",
            default_root_object="index.html",
            domain_names=[DOMAIN],
            certificate=cert,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(web_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                # HSTS, nosniff, frame-options, referrer-policy (AWS managed).
                response_headers_policy=cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
            ),
            additional_behaviors={
                # Only tt/* is public; the objects carry their own Cache-Control.
                "tt/*": cloudfront.BehaviorOptions(
                    origin=origins.S3BucketOrigin.with_origin_access_control(data_bucket),
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    response_headers_policy=cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                ),
            },
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
        )
        s3deploy.BucketDeployment(
            self,
            "WebDeploy",
            # The Vite build output: `npm run build` in apps/web must run first.
            sources=[s3deploy.Source.asset("../apps/web/dist")],
            destination_bucket=web_bucket,
            distribution=distribution,
            # Vite fingerprints assets, so only index.html, sw.js and the manifest ever
            # change in place; a short max-age gets a deploy to users on the next open.
            cache_control=[s3deploy.CacheControl.max_age(cdk.Duration.minutes(5))],
        )
        route53.ARecord(
            self,
            "WebDns",
            zone=zone,
            record_name=DOMAIN,
            target=route53.RecordTarget.from_alias(targets.CloudFrontTarget(distribution)),
        )

        cdk.CfnOutput(self, "OutWebUrl", value=f"https://{DOMAIN}")
        cdk.CfnOutput(self, "OutDataBucket", value=data_bucket.bucket_name)
        cdk.CfnOutput(self, "OutInstanceId", value=server["instance_id"])


app = cdk.App()
cert_stack = CertStack(
    app,
    "SlEasyCert",
    env=cdk.Environment(account=ACCOUNT, region="us-east-1"),
    cross_region_references=True,
)
SlEasyStack(
    app,
    "SlEasy",
    cert=cert_stack.cert,
    env=cdk.Environment(account=ACCOUNT, region=REGION),
    cross_region_references=True,
)
app.synth()
