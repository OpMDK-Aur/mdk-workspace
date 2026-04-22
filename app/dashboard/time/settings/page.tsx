'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState } from 'react'
import { toast } from 'sonner'

export default function TimeSettingsPage() {
  const [autoStopTimer, setAutoStopTimer] = useState(false)
  const [defaultBillable, setDefaultBillable] = useState(true)
  const [weekStart, setWeekStart] = useState('monday')
  const [timeFormat, setTimeFormat] = useState('24h')

  const handleSettingChange = (setting: string) => {
    toast.success(`${setting} updated`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your time tracking preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Timer Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timer Settings</CardTitle>
            <CardDescription>
              Configure how the timer behaves
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-stop" className="font-medium">
                  Auto-stop timer at midnight
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Automatically stop running timers at 12:00 AM
                </p>
              </div>
              <Switch
                id="auto-stop"
                checked={autoStopTimer}
                onCheckedChange={(checked) => {
                  setAutoStopTimer(checked)
                  handleSettingChange('Auto-stop timer')
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="default-billable" className="font-medium">
                  Default billable status
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  New time entries are billable by default
                </p>
              </div>
              <Switch
                id="default-billable"
                checked={defaultBillable}
                onCheckedChange={(checked) => {
                  setDefaultBillable(checked)
                  handleSettingChange('Default billable')
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Display Settings</CardTitle>
            <CardDescription>
              Customize how time is displayed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="week-start" className="font-medium">
                  Week starts on
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  First day of the week in reports
                </p>
              </div>
              <Select
                value={weekStart}
                onValueChange={(val) => {
                  setWeekStart(val)
                  handleSettingChange('Week start')
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="sunday">Sunday</SelectItem>
                  <SelectItem value="saturday">Saturday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="time-format" className="font-medium">
                  Time format
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  How time is displayed throughout the app
                </p>
              </div>
              <Select
                value={timeFormat}
                onValueChange={(val) => {
                  setTimeFormat(val)
                  handleSettingChange('Time format')
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour (14:30)</SelectItem>
                  <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
