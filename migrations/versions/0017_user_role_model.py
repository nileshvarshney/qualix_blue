"""Add user/role/team RBAC tables: teams, team_memberships, user_roles, team_roles, notification_targets.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-11
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'teams',
        sa.Column('team_id', sa.String(36), primary_key=True),
        sa.Column('team_name', sa.String(200), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'team_memberships',
        sa.Column('membership_id', sa.String(36), primary_key=True),
        sa.Column('team_id', sa.String(36),
                  sa.ForeignKey('teams.team_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_in_team', sa.String(50), nullable=True),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('team_id', 'user_id', name='uq_team_membership'),
    )

    op.create_table(
        'user_roles',
        sa.Column('user_role_id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(30), nullable=False),
        sa.Column('granted_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'role', name='uq_user_role'),
    )

    op.create_table(
        'team_roles',
        sa.Column('team_role_id', sa.String(36), primary_key=True),
        sa.Column('team_id', sa.String(36),
                  sa.ForeignKey('teams.team_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(30), nullable=False),
        sa.Column('granted_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('team_id', 'role', name='uq_team_role'),
    )

    op.create_table(
        'notification_targets',
        sa.Column('target_id', sa.String(36), primary_key=True),
        sa.Column('entity_type', sa.String(20), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=False),
        sa.Column('channel', sa.String(30), nullable=False),
        sa.Column('address', sa.String(500), nullable=False),
        sa.Column('label', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('entity_type', 'entity_id', 'channel',
                            name='uq_notification_target_entity_channel'),
    )

    op.create_index('ix_team_memberships_team_id', 'team_memberships', ['team_id'])
    op.create_index('ix_team_memberships_user_id', 'team_memberships', ['user_id'])
    op.create_index('ix_user_roles_user_id', 'user_roles', ['user_id'])
    op.create_index('ix_team_roles_team_id', 'team_roles', ['team_id'])
    op.create_index('ix_notification_targets_entity', 'notification_targets',
                    ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_index('ix_notification_targets_entity', table_name='notification_targets')
    op.drop_index('ix_team_roles_team_id', table_name='team_roles')
    op.drop_index('ix_user_roles_user_id', table_name='user_roles')
    op.drop_index('ix_team_memberships_user_id', table_name='team_memberships')
    op.drop_index('ix_team_memberships_team_id', table_name='team_memberships')
    op.drop_table('notification_targets')
    op.drop_table('team_roles')
    op.drop_table('user_roles')
    op.drop_table('team_memberships')
    op.drop_table('teams')
